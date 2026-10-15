-- 1. Session numbers follow the calendar. Each trainee's lessons in a purchase are numbered
--    1..N in date order and total_sessions is N, kept so by triggers after any insert,
--    move or delete (moves within a week, cancellations, deleted lessons). "Son ders" on
--    the board (session_number = total_sessions, no successor) is then always the
--    trainee's last lesson on the calendar.
-- 2. pe_move_enrollments can delete the emptied appointments in the same transaction, so
--    cancelling a group lesson with a shift is all or nothing.
-- 3. pe_auth_user_id(email) lets the server (service role only) find an existing login, so
--    removed staff can be added back and an existing login can join the studio.

-- ------------------------------------------------------------- 1. session numbers
CREATE OR REPLACE FUNCTION public.pe_renumber_sessions(p_purchase_ids uuid[])
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
	UPDATE public.pe_appointment_trainees t
	SET session_number = r.n, total_sessions = r.total
	FROM (
		SELECT at.id,
			row_number() OVER (PARTITION BY at.purchase_id, at.trainee_id ORDER BY a.date, a.hour, at.id) AS n,
			count(*) OVER (PARTITION BY at.purchase_id, at.trainee_id) AS total
		FROM public.pe_appointment_trainees at
		JOIN public.pe_appointments a ON a.id = at.appointment_id
		WHERE at.purchase_id = ANY (p_purchase_ids)
	) r
	WHERE t.id = r.id
		AND (t.session_number IS DISTINCT FROM r.n OR t.total_sessions IS DISTINCT FROM r.total);
$$;

CREATE OR REPLACE FUNCTION public.pe_enrollments_renumber_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	v_purchase_ids uuid[] := ARRAY(SELECT DISTINCT purchase_id FROM new_rows);
BEGIN
	IF cardinality(v_purchase_ids) > 0 THEN
		PERFORM public.pe_renumber_sessions(v_purchase_ids);
	END IF;
	RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.pe_enrollments_renumber_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	v_purchase_ids uuid[] := ARRAY(SELECT DISTINCT purchase_id FROM old_rows);
BEGIN
	IF cardinality(v_purchase_ids) > 0 THEN
		PERFORM public.pe_renumber_sessions(v_purchase_ids);
	END IF;
	RETURN NULL;
END;
$$;

-- Only rows that changed appointment or purchase. The renumbering's own update runs inside
-- a trigger (depth > 1) and is skipped: statement triggers fire even for zero rows, so
-- without the guard it would call itself forever.
CREATE OR REPLACE FUNCTION public.pe_enrollments_renumber_after_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	v_purchase_ids uuid[];
BEGIN
	IF pg_trigger_depth() > 1 THEN
		RETURN NULL;
	END IF;
	v_purchase_ids := ARRAY(
		SELECT DISTINCT p.purchase_id
		FROM new_rows n
		JOIN old_rows o ON o.id = n.id
		CROSS JOIN LATERAL (VALUES (n.purchase_id), (o.purchase_id)) AS p(purchase_id)
		WHERE n.appointment_id IS DISTINCT FROM o.appointment_id
			OR n.purchase_id IS DISTINCT FROM o.purchase_id
	);
	IF cardinality(v_purchase_ids) > 0 THEN
		PERFORM public.pe_renumber_sessions(v_purchase_ids);
	END IF;
	RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.pe_appointments_renumber_after_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	v_purchase_ids uuid[] := ARRAY(
		SELECT DISTINCT t.purchase_id
		FROM new_rows n
		JOIN old_rows o ON o.id = n.id
		JOIN public.pe_appointment_trainees t ON t.appointment_id = n.id
		WHERE n.date IS DISTINCT FROM o.date OR n.hour IS DISTINCT FROM o.hour
	);
BEGIN
	IF cardinality(v_purchase_ids) > 0 THEN
		PERFORM public.pe_renumber_sessions(v_purchase_ids);
	END IF;
	RETURN NULL;
END;
$$;

CREATE TRIGGER pe_enrollments_renumber_insert
	AFTER INSERT ON public.pe_appointment_trainees
	REFERENCING NEW TABLE AS new_rows
	FOR EACH STATEMENT EXECUTE FUNCTION public.pe_enrollments_renumber_after_insert();

CREATE TRIGGER pe_enrollments_renumber_delete
	AFTER DELETE ON public.pe_appointment_trainees
	REFERENCING OLD TABLE AS old_rows
	FOR EACH STATEMENT EXECUTE FUNCTION public.pe_enrollments_renumber_after_delete();

CREATE TRIGGER pe_enrollments_renumber_update
	AFTER UPDATE ON public.pe_appointment_trainees
	REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
	FOR EACH STATEMENT EXECUTE FUNCTION public.pe_enrollments_renumber_after_update();

CREATE TRIGGER pe_appointments_renumber_update
	AFTER UPDATE ON public.pe_appointments
	REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
	FOR EACH STATEMENT EXECUTE FUNCTION public.pe_appointments_renumber_after_update();

-- Runs as the caller (RLS applies), from the triggers above
REVOKE ALL ON FUNCTION public.pe_renumber_sessions(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_renumber_sessions(uuid[]) TO authenticated;

-- Bring existing numbers in line (stale after moves within a week and deleted lessons)
SELECT public.pe_renumber_sessions(ARRAY(SELECT id FROM public.pe_purchases));

-- ------------------------------------------------------------- 2. atomic group cancel
DROP FUNCTION public.pe_move_enrollments(jsonb);

-- Moves enrollment rows to other appointments; then deletes p_delete_appointment_ids
-- (appointments the moves emptied). All or nothing. Numbering is left to the triggers.
CREATE FUNCTION public.pe_move_enrollments(
	p_moves jsonb,
	p_delete_appointment_ids bigint[] DEFAULT '{}'
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	v_expected int := jsonb_array_length(p_moves);
	v_count int := 0;
	v_deleted int;
BEGIN
	IF v_expected > 0 THEN
		UPDATE public.pe_appointment_trainees t
		SET appointment_id = NULL
		WHERE t.id IN (SELECT (m ->> 'id')::bigint FROM jsonb_array_elements(p_moves) m);
		GET DIAGNOSTICS v_count = ROW_COUNT;
		IF v_count <> v_expected THEN
			RAISE EXCEPTION 'Taşınacak öğrenci kayıtlarının bazıları bulunamadı';
		END IF;

		UPDATE public.pe_appointment_trainees t
		SET appointment_id = m.appointment_id
		FROM jsonb_to_recordset(p_moves) AS m(id bigint, appointment_id bigint)
		WHERE t.id = m.id;
	END IF;

	IF cardinality(p_delete_appointment_ids) > 0 THEN
		DELETE FROM public.pe_appointments a WHERE a.id = ANY (p_delete_appointment_ids);
		GET DIAGNOSTICS v_deleted = ROW_COUNT;
		IF v_deleted <> cardinality(p_delete_appointment_ids) THEN
			RAISE EXCEPTION 'Randevu silinemedi; sayfayı yenileyip tekrar deneyin';
		END IF;
	END IF;

	RETURN v_count;
EXCEPTION
	WHEN unique_violation THEN
		RAISE EXCEPTION 'Öğrenci hedef randevuya zaten kayıtlı';
END;
$$;

REVOKE ALL ON FUNCTION public.pe_move_enrollments(jsonb, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_move_enrollments(jsonb, bigint[]) TO authenticated;

-- ------------------------------------------------------------- 3. existing logins
-- The auth project is shared with other apps: the server looks an e-mail up only to add
-- that login to a studio, never to list users.
CREATE OR REPLACE FUNCTION public.pe_auth_user_id(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.pe_auth_user_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pe_auth_user_id(text) TO service_role;
