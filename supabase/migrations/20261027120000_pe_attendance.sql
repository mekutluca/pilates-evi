-- Attendance (Yoklama) and what follows an absence.
--
-- 1. Packages say whether attendance is taken (group packages by default, private ones can
--    switch it on) and whether a missed lesson may be made up in another group session
--    (`makeup_allowed` / `makeup_limit`, the pair mirroring `reschedulable` /
--    `reschedule_limit`; NULL limit = unlimited). Each kayıt carries `makeup_left` like
--    `reschedule_left` (999 = unlimited), filled from the package on insert by a trigger so
--    every path that opens a kayıt (Yeni kayıt, Yenile, the demo seed) gets it.
-- 2. Attendance lives on the enrollment row (a trainee at a lesson): `attendance`
--    (attended / absent, NULL = not taken), who took it and when, and what the studio decided
--    about an absence (`absence_outcome`: burned, shifted, makeup; NULL = awaiting a
--    decision). A shift or a make-up is a replacement lesson: a new enrollment row pointing
--    at the missed one through `makeup_for_id` (one per missed lesson). A shift goes to the
--    kayıt's next pattern slot after its last lesson (a new private appointment, or the group
--    lesson's next session), a make-up to a group session staff pick.
-- 3. Numbering: a missed lesson that was replaced drops out of the 1..N numbering (its row
--    keeps its old number) and the replacement is numbered in calendar order, so "Son ders"
--    and the totals stay true to what the client gets.
-- 4. Deleting a replacement (Kaldır, or its lesson cancelled) puts the missed lesson back to
--    "awaiting a decision" and refunds the credit it spent, by trigger, so cascades do it too.
-- 5. RPCs: pe_set_attendance (trainers for their own lessons, from the start hour until the
--    end of the next day; staff any time), pe_resolve_absence (burn / shift / make-up, with the
--    credit, capacity and duplicate checks in one transaction), pe_move_makeup, pe_remove_makeup.

-- ------------------------------------------------------------------ packages
ALTER TABLE public.pe_packages
	ADD COLUMN attendance_enabled boolean NOT NULL DEFAULT false,
	ADD COLUMN makeup_allowed boolean NOT NULL DEFAULT false,
	ADD COLUMN makeup_limit integer,
	ADD CONSTRAINT pe_packages_makeup_limit_range
		CHECK (makeup_limit IS NULL OR makeup_limit BETWEEN 1 AND 50);

-- Group packages take attendance and give two make-ups; private ones keep their reschedule
-- credits as the way to shift a missed lesson
UPDATE public.pe_packages
SET attendance_enabled = true, makeup_allowed = true, makeup_limit = 2
WHERE package_type = 'group';

-- ----------------------------------------------------------------- purchases
ALTER TABLE public.pe_purchases
	ADD COLUMN makeup_left integer,
	ADD CONSTRAINT pe_purchases_makeup_left_nonnegative CHECK (makeup_left >= 0);

UPDATE public.pe_purchases p
SET makeup_left = CASE WHEN k.makeup_allowed THEN coalesce(k.makeup_limit, 999) ELSE 0 END
FROM public.pe_packages k
WHERE k.id = p.package_id;

ALTER TABLE public.pe_purchases ALTER COLUMN makeup_left SET NOT NULL;

-- A new kayıt starts with the package's make-up credits unless the insert says otherwise
CREATE OR REPLACE FUNCTION public.pe_purchases_default_makeup_left()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
	IF NEW.makeup_left IS NULL THEN
		SELECT CASE WHEN k.makeup_allowed THEN coalesce(k.makeup_limit, 999) ELSE 0 END
		INTO NEW.makeup_left
		FROM public.pe_packages k
		WHERE k.id = NEW.package_id;
		NEW.makeup_left := coalesce(NEW.makeup_left, 0);
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER pe_purchases_default_makeup_left
	BEFORE INSERT ON public.pe_purchases
	FOR EACH ROW EXECUTE FUNCTION public.pe_purchases_default_makeup_left();

-- --------------------------------------------------------------- enrollments
ALTER TABLE public.pe_appointment_trainees
	ADD COLUMN attendance text,
	ADD COLUMN attendance_at timestamptz,
	ADD COLUMN attendance_by uuid,
	ADD COLUMN absence_outcome text,
	ADD COLUMN makeup_for_id bigint,
	ADD COLUMN credit_spent boolean NOT NULL DEFAULT false,
	ADD CONSTRAINT pe_appointment_trainees_attendance_values
		CHECK (attendance IS NULL OR attendance IN ('attended', 'absent')),
	ADD CONSTRAINT pe_appointment_trainees_outcome_values
		CHECK (absence_outcome IS NULL OR absence_outcome IN ('burned', 'shifted', 'makeup')),
	ADD CONSTRAINT pe_appointment_trainees_outcome_needs_absence
		CHECK (absence_outcome IS NULL OR attendance = 'absent'),
	ADD CONSTRAINT pe_appointment_trainees_makeup_for_id_fkey FOREIGN KEY (makeup_for_id)
		REFERENCES public.pe_appointment_trainees(id) ON DELETE CASCADE;

-- One replacement per missed lesson
CREATE UNIQUE INDEX uq_pe_appointment_trainees_makeup_for
	ON public.pe_appointment_trainees (makeup_for_id)
	WHERE makeup_for_id IS NOT NULL;

-- The Panel's "awaiting a decision" list
CREATE INDEX pe_appointment_trainees_pending_absence_idx
	ON public.pe_appointment_trainees (organization_id, appointment_id)
	WHERE attendance = 'absent' AND absence_outcome IS NULL;

-- ----------------------------------------------------------------- numbering
-- Replaced lessons (shifted or made up) keep their number but leave the 1..N sequence
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
			AND (at.absence_outcome IS NULL OR at.absence_outcome NOT IN ('shifted', 'makeup'))
	) r
	WHERE t.id = r.id
		AND (t.session_number IS DISTINCT FROM r.n OR t.total_sessions IS DISTINCT FROM r.total);
$$;

-- A decided or undone replacement changes who is in the sequence
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
			OR n.absence_outcome IS DISTINCT FROM o.absence_outcome
	);
	IF cardinality(v_purchase_ids) > 0 THEN
		PERFORM public.pe_renumber_sessions(v_purchase_ids);
	END IF;
	RETURN NULL;
END;
$$;

-- ---------------------------------------------------- replacement removed
-- The missed lesson goes back to awaiting a decision and gets its credit back. Runs for
-- every delete, so a cancelled session or a closed day undo the make-ups they held.
CREATE OR REPLACE FUNCTION public.pe_makeup_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	v_outcome text;
BEGIN
	SELECT absence_outcome INTO v_outcome
	FROM public.pe_appointment_trainees
	WHERE id = OLD.makeup_for_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RETURN NULL;
	END IF;
	UPDATE public.pe_appointment_trainees SET absence_outcome = NULL WHERE id = OLD.makeup_for_id;
	IF OLD.credit_spent AND v_outcome = 'shifted' THEN
		UPDATE public.pe_purchases SET reschedule_left = reschedule_left + 1
		WHERE id = OLD.purchase_id AND reschedule_left < 999;
	ELSIF OLD.credit_spent AND v_outcome = 'makeup' THEN
		UPDATE public.pe_purchases SET makeup_left = makeup_left + 1
		WHERE id = OLD.purchase_id AND makeup_left < 999;
	END IF;
	RETURN NULL;
END;
$$;

CREATE TRIGGER pe_makeup_after_delete
	AFTER DELETE ON public.pe_appointment_trainees
	FOR EACH ROW
	WHEN (OLD.makeup_for_id IS NOT NULL)
	EXECUTE FUNCTION public.pe_makeup_after_delete();

-- ------------------------------------------------------------ helpers
-- Checks that a replacement can go into a group session: same package as the kayıt, in the
-- future, a free seat, and the trainee not already in it. Locks the session.
CREATE OR REPLACE FUNCTION public.pe_check_makeup_target(
	p_target_appointment_id bigint,
	p_trainee_id uuid,
	p_package_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	v_target record;
	v_now timestamp := now() AT TIME ZONE 'Europe/Istanbul';
	v_taken int;
BEGIN
	SELECT a.id, a.date, a.hour, g.package_id, k.max_capacity
	INTO v_target
	FROM public.pe_appointments a
	JOIN public.pe_group_lessons g ON g.id = a.group_lesson_id
	JOIN public.pe_packages k ON k.id = g.package_id
	WHERE a.id = p_target_appointment_id
	FOR UPDATE OF a;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Telafi için bir grup dersi seçin';
	END IF;
	IF v_target.package_id <> p_package_id THEN
		RAISE EXCEPTION 'Telafi dersi aynı paketten olmalı';
	END IF;
	IF v_target.date + make_interval(hours => v_target.hour) <= v_now THEN
		RAISE EXCEPTION 'Telafi dersi gelecekte olmalı';
	END IF;
	SELECT count(*) INTO v_taken
	FROM public.pe_appointment_trainees
	WHERE appointment_id = p_target_appointment_id;
	IF EXISTS (
		SELECT 1 FROM public.pe_appointment_trainees
		WHERE appointment_id = p_target_appointment_id AND trainee_id = p_trainee_id
	) THEN
		RAISE EXCEPTION 'Öğrenci bu derse zaten kayıtlı';
	END IF;
	IF v_taken >= v_target.max_capacity THEN
		RAISE EXCEPTION 'Telafi dersinde yer yok';
	END IF;
END;
$$;

-- ------------------------------------------------------- pe_set_attendance
-- Trainers have no write policy on enrollments, so this runs as the definer and checks the
-- studio, the role and (for a trainer) that the lesson is theirs and at most a day old.
-- p_attendance: 'attended', 'absent', or '' / NULL to clear the mark.
CREATE OR REPLACE FUNCTION public.pe_set_attendance(p_enrollment_id bigint, p_attendance text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_org uuid := public.pe_get_auth_org_id();
	v_role text := public.pe_get_auth_org_role();
	v_now timestamp := now() AT TIME ZONE 'Europe/Istanbul';
	v_row record;
	v_attendance text := nullif(p_attendance, '');
BEGIN
	IF v_attendance IS NOT NULL AND v_attendance NOT IN ('attended', 'absent') THEN
		RAISE EXCEPTION 'Geçersiz yoklama değeri';
	END IF;

	SELECT t.id, t.absence_outcome, a.date, a.hour, a.trainer_id
	INTO v_row
	FROM public.pe_appointment_trainees t
	JOIN public.pe_appointments a ON a.id = t.appointment_id
	WHERE t.id = p_enrollment_id AND t.organization_id = v_org
	FOR UPDATE OF t;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Öğrenci kaydı bulunamadı';
	END IF;

	IF v_role = 'pe_trainer' THEN
		IF v_row.trainer_id IS DISTINCT FROM auth.uid() THEN
			RAISE EXCEPTION 'Bu işlem için yetkiniz yok';
		END IF;
		IF v_row.date < v_now::date - 1 THEN
			RAISE EXCEPTION 'Yoklama en geç ertesi gün değiştirilebilir';
		END IF;
	ELSIF v_role NOT IN ('pe_admin', 'pe_coordinator') THEN
		RAISE EXCEPTION 'Bu işlem için yetkiniz yok';
	END IF;

	IF v_row.date + make_interval(hours => v_row.hour) > v_now THEN
		RAISE EXCEPTION 'Yoklama ders başladıktan sonra alınabilir';
	END IF;
	IF v_row.absence_outcome IN ('shifted', 'makeup') AND v_attendance IS DISTINCT FROM 'absent' THEN
		RAISE EXCEPTION 'Önce telafi dersini kaldırın';
	END IF;

	UPDATE public.pe_appointment_trainees
	SET attendance = v_attendance,
		attendance_at = CASE WHEN v_attendance IS NULL THEN NULL ELSE now() END,
		attendance_by = CASE WHEN v_attendance IS NULL THEN NULL ELSE auth.uid() END,
		absence_outcome = CASE WHEN v_attendance = 'absent' THEN absence_outcome ELSE NULL END
	WHERE id = p_enrollment_id;
END;
$$;

-- ------------------------------------------------------ pe_resolve_absence
-- What happens to a missed lesson. 'burned': nothing more. 'shifted' / 'makeup': a replacement
-- enrollment, into p_target_appointment_id (a group session) or into a new private appointment
-- (p_new_appointment: room_id, trainer_id, date, hour). With p_consume_credit the kayıt's
-- reschedule (shift) or make-up credit is spent; the purchase row is locked so two desks
-- cannot both spend the last one. Returns the replacement's id (NULL when burned).
CREATE OR REPLACE FUNCTION public.pe_resolve_absence(
	p_enrollment_id bigint,
	p_outcome text,
	p_target_appointment_id bigint DEFAULT NULL,
	p_new_appointment jsonb DEFAULT NULL,
	p_consume_credit boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	v_now timestamp := now() AT TIME ZONE 'Europe/Istanbul';
	v_origin record;
	v_purchase record;
	v_appointment_id bigint;
	v_replacement_id bigint;
	v_date date;
	v_hour int;
BEGIN
	IF public.pe_get_auth_org_role() NOT IN ('pe_admin', 'pe_coordinator') THEN
		RAISE EXCEPTION 'Bu işlem için yetkiniz yok';
	END IF;
	IF p_outcome NOT IN ('burned', 'shifted', 'makeup') THEN
		RAISE EXCEPTION 'Geçersiz devamsızlık kararı';
	END IF;

	SELECT t.id, t.attendance, t.absence_outcome, t.trainee_id, t.purchase_id,
		t.session_number, t.total_sessions
	INTO v_origin
	FROM public.pe_appointment_trainees t
	WHERE t.id = p_enrollment_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Öğrenci kaydı bulunamadı';
	END IF;
	IF v_origin.attendance IS DISTINCT FROM 'absent' THEN
		RAISE EXCEPTION 'Öğrenci bu derse gelmedi olarak işaretlenmemiş';
	END IF;
	IF v_origin.absence_outcome IN ('shifted', 'makeup') THEN
		RAISE EXCEPTION 'Bu ders için zaten telafi dersi var';
	END IF;

	IF p_outcome = 'burned' THEN
		UPDATE public.pe_appointment_trainees SET absence_outcome = 'burned' WHERE id = p_enrollment_id;
		RETURN NULL;
	END IF;

	SELECT id, package_id, reschedule_left, makeup_left
	INTO v_purchase
	FROM public.pe_purchases
	WHERE id = v_origin.purchase_id
	FOR UPDATE;

	IF p_consume_credit AND p_outcome = 'shifted' THEN
		IF coalesce(v_purchase.reschedule_left, 0) <= 0 THEN
			RAISE EXCEPTION 'Bu kayıt için randevu değiştirme hakkı kalmamış';
		END IF;
		IF v_purchase.reschedule_left < 999 THEN
			UPDATE public.pe_purchases SET reschedule_left = reschedule_left - 1 WHERE id = v_purchase.id;
		END IF;
	ELSIF p_consume_credit AND p_outcome = 'makeup' THEN
		IF coalesce(v_purchase.makeup_left, 0) <= 0 THEN
			RAISE EXCEPTION 'Bu kayıt için telafi hakkı kalmamış';
		END IF;
		IF v_purchase.makeup_left < 999 THEN
			UPDATE public.pe_purchases SET makeup_left = makeup_left - 1 WHERE id = v_purchase.id;
		END IF;
	END IF;

	IF p_target_appointment_id IS NOT NULL THEN
		PERFORM public.pe_check_makeup_target(
			p_target_appointment_id, v_origin.trainee_id, v_purchase.package_id);
		v_appointment_id := p_target_appointment_id;
	ELSIF p_new_appointment IS NOT NULL THEN
		IF p_outcome <> 'shifted' THEN
			RAISE EXCEPTION 'Telafi için bir grup dersi seçin';
		END IF;
		v_date := (p_new_appointment ->> 'date')::date;
		v_hour := (p_new_appointment ->> 'hour')::int;
		IF v_date + make_interval(hours => v_hour) <= v_now THEN
			RAISE EXCEPTION 'Kaydırılan ders gelecekte olmalı';
		END IF;
		INSERT INTO public.pe_appointments (room_id, trainer_id, date, hour, purchase_id)
		VALUES ((p_new_appointment ->> 'room_id')::uuid, (p_new_appointment ->> 'trainer_id')::uuid,
			v_date, v_hour, v_purchase.id)
		RETURNING id INTO v_appointment_id;
	ELSE
		RAISE EXCEPTION 'Telafi dersi seçilmedi';
	END IF;

	UPDATE public.pe_appointment_trainees SET absence_outcome = p_outcome WHERE id = p_enrollment_id;

	INSERT INTO public.pe_appointment_trainees
		(appointment_id, trainee_id, purchase_id, session_number, total_sessions, makeup_for_id, credit_spent)
	VALUES (v_appointment_id, v_origin.trainee_id, v_origin.purchase_id,
		v_origin.session_number, v_origin.total_sessions, p_enrollment_id, p_consume_credit)
	RETURNING id INTO v_replacement_id;

	RETURN v_replacement_id;
EXCEPTION
	WHEN unique_violation THEN
		RAISE EXCEPTION 'Seçilen saat dolu (oda veya eğitmen çakışması)';
END;
$$;

-- --------------------------------------------------------- pe_move_makeup
-- Moves a make-up (a replacement in a group session) to another session of the same package.
CREATE OR REPLACE FUNCTION public.pe_move_makeup(p_enrollment_id bigint, p_target_appointment_id bigint)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	v_row record;
	v_now timestamp := now() AT TIME ZONE 'Europe/Istanbul';
BEGIN
	IF public.pe_get_auth_org_role() NOT IN ('pe_admin', 'pe_coordinator') THEN
		RAISE EXCEPTION 'Bu işlem için yetkiniz yok';
	END IF;
	SELECT t.id, t.trainee_id, p.package_id, a.date, a.hour, a.group_lesson_id
	INTO v_row
	FROM public.pe_appointment_trainees t
	JOIN public.pe_purchases p ON p.id = t.purchase_id
	JOIN public.pe_appointments a ON a.id = t.appointment_id
	WHERE t.id = p_enrollment_id AND t.makeup_for_id IS NOT NULL
	FOR UPDATE OF t;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Telafi dersi bulunamadı';
	END IF;
	IF v_row.group_lesson_id IS NULL THEN
		RAISE EXCEPTION 'Kaydırılan özel ders Taşı ile taşınır';
	END IF;
	IF v_row.date + make_interval(hours => v_row.hour) <= v_now THEN
		RAISE EXCEPTION 'Geçmiş telafi dersi taşınamaz';
	END IF;
	PERFORM public.pe_check_makeup_target(p_target_appointment_id, v_row.trainee_id, v_row.package_id);
	UPDATE public.pe_appointment_trainees
	SET appointment_id = p_target_appointment_id
	WHERE id = p_enrollment_id;
END;
$$;

-- ------------------------------------------------------- pe_remove_makeup
-- Removes a replacement lesson: the missed lesson awaits a decision again (trigger) and a
-- private appointment left empty goes with it.
CREATE OR REPLACE FUNCTION public.pe_remove_makeup(p_enrollment_id bigint)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
	v_row record;
	v_now timestamp := now() AT TIME ZONE 'Europe/Istanbul';
BEGIN
	IF public.pe_get_auth_org_role() NOT IN ('pe_admin', 'pe_coordinator') THEN
		RAISE EXCEPTION 'Bu işlem için yetkiniz yok';
	END IF;
	SELECT t.id, t.appointment_id, a.date, a.hour, a.purchase_id
	INTO v_row
	FROM public.pe_appointment_trainees t
	JOIN public.pe_appointments a ON a.id = t.appointment_id
	WHERE t.id = p_enrollment_id AND t.makeup_for_id IS NOT NULL
	FOR UPDATE OF t;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Telafi dersi bulunamadı';
	END IF;
	IF v_row.date + make_interval(hours => v_row.hour) <= v_now THEN
		RAISE EXCEPTION 'Geçmiş telafi dersi kaldırılamaz';
	END IF;
	DELETE FROM public.pe_appointment_trainees WHERE id = p_enrollment_id;
	IF v_row.purchase_id IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM public.pe_appointment_trainees WHERE appointment_id = v_row.appointment_id
	) THEN
		DELETE FROM public.pe_appointments WHERE id = v_row.appointment_id;
	END IF;
END;
$$;

-- -------------------------------------------------------------------- grants
REVOKE ALL ON FUNCTION public.pe_purchases_default_makeup_left() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pe_makeup_after_delete() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pe_check_makeup_target(bigint, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pe_set_attendance(bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pe_resolve_absence(bigint, text, bigint, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pe_move_makeup(bigint, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pe_remove_makeup(bigint) FROM PUBLIC, anon;
-- Trigger functions run as the caller, like the renumbering ones
GRANT EXECUTE ON FUNCTION public.pe_purchases_default_makeup_left() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pe_makeup_after_delete() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pe_check_makeup_target(bigint, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pe_set_attendance(bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pe_resolve_absence(bigint, text, bigint, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pe_move_makeup(bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pe_remove_makeup(bigint) TO authenticated;
