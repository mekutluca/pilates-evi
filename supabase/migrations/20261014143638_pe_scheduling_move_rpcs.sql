-- Transactional moves for appointments and enrollments, an atomic reschedule
-- (credit + move), and a locked extend.

-- ------------------------------------------------------- pe_move_appointments
-- p_moves: [{ id, date, hour, room_id?, trainer_id? }] — omitted room/trainer keep
-- their current value. Unique slot indexes are checked row by row, so moving a
-- series onto its own later slots (shift by +1 week) collides mid-statement in any
-- update order. Every moving row is first parked far in the future, then placed;
-- after parking, a collision can only be a real conflict, and the whole move
-- rolls back.
CREATE OR REPLACE FUNCTION public.pe_move_appointments(p_moves jsonb)
	RETURNS integer
	LANGUAGE plpgsql
	SET search_path = ''
AS $$
DECLARE
	v_expected int := jsonb_array_length(p_moves);
	v_count int;
BEGIN
	IF v_expected = 0 THEN
		RETURN 0;
	END IF;

	UPDATE public.pe_appointments a
	SET date = a.date + 1000000
	WHERE a.id IN (SELECT (m ->> 'id')::bigint FROM jsonb_array_elements(p_moves) m);
	GET DIAGNOSTICS v_count = ROW_COUNT;
	IF v_count <> v_expected THEN
		RAISE EXCEPTION 'Taşınacak randevuların bazıları bulunamadı';
	END IF;

	UPDATE public.pe_appointments a
	SET date = m.date,
		hour = m.hour,
		room_id = coalesce(m.room_id, a.room_id),
		trainer_id = coalesce(m.trainer_id, a.trainer_id)
	FROM jsonb_to_recordset(p_moves) AS m(id bigint, date date, hour smallint, room_id uuid, trainer_id uuid)
	WHERE a.id = m.id;

	RETURN v_count;
EXCEPTION
	WHEN unique_violation THEN
		RAISE EXCEPTION 'Hedef saatlerden biri dolu (oda veya eğitmen çakışması)';
END;
$$;

-- -------------------------------------------------------- pe_move_enrollments
-- p_moves: [{ id, appointment_id }]. Same parking idea (appointment_id NULL is
-- ignored by the (appointment_id, trainee_id) unique index), then session numbers
-- are renumbered chronologically within each purchase the moved records belong to.
CREATE OR REPLACE FUNCTION public.pe_move_enrollments(p_moves jsonb)
	RETURNS integer
	LANGUAGE plpgsql
	SET search_path = ''
AS $$
DECLARE
	v_expected int := jsonb_array_length(p_moves);
	v_count int;
BEGIN
	IF v_expected = 0 THEN
		RETURN 0;
	END IF;

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

	UPDATE public.pe_appointment_trainees t
	SET session_number = r.rn
	FROM (
		SELECT t2.id,
			row_number() OVER (PARTITION BY t2.trainee_id, t2.purchase_id ORDER BY a.date, a.hour, t2.id) AS rn
		FROM public.pe_appointment_trainees t2
		JOIN public.pe_appointments a ON a.id = t2.appointment_id
		WHERE (t2.trainee_id, t2.purchase_id) IN (
			SELECT t3.trainee_id, t3.purchase_id
			FROM public.pe_appointment_trainees t3
			WHERE t3.id IN (SELECT (m ->> 'id')::bigint FROM jsonb_array_elements(p_moves) m)
		)
	) r
	WHERE t.id = r.id
		AND t.session_number IS DISTINCT FROM r.rn;

	RETURN v_count;
EXCEPTION
	WHEN unique_violation THEN
		RAISE EXCEPTION 'Öğrenci hedef randevuya zaten kayıtlı';
END;
$$;

-- -------------------------------------------------- pe_reschedule_appointment
-- Consumes a reschedule credit (when asked) and moves the appointment in one
-- transaction; the purchase row is locked so concurrent reschedules cannot both
-- spend the last credit. reschedule_left = 999 means unlimited and is never
-- decremented. Returns the credits left after the move (NULL when no credit was
-- involved).
CREATE OR REPLACE FUNCTION public.pe_reschedule_appointment(
	p_appointment_id bigint,
	p_date date,
	p_hour smallint,
	p_room_id uuid,
	p_consume_credit boolean
)
	RETURNS integer
	LANGUAGE plpgsql
	SET search_path = ''
AS $$
DECLARE
	v_purchase uuid;
	v_left int;
BEGIN
	SELECT purchase_id INTO v_purchase
	FROM public.pe_appointments
	WHERE id = p_appointment_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Randevu bulunamadı';
	END IF;

	IF p_consume_credit THEN
		IF v_purchase IS NULL THEN
			RAISE EXCEPTION 'Bu randevu için değişiklik hakkı yok';
		END IF;
		SELECT reschedule_left INTO v_left
		FROM public.pe_purchases
		WHERE id = v_purchase
		FOR UPDATE;
		IF coalesce(v_left, 0) <= 0 THEN
			RAISE EXCEPTION 'Bu kayıt için randevu değiştirme hakkı kalmamış';
		END IF;
		IF v_left < 999 THEN
			v_left := v_left - 1;
			UPDATE public.pe_purchases SET reschedule_left = v_left WHERE id = v_purchase;
		END IF;
	END IF;

	UPDATE public.pe_appointments
	SET date = p_date, hour = p_hour, room_id = p_room_id
	WHERE id = p_appointment_id;

	RETURN v_left;
EXCEPTION
	WHEN unique_violation THEN
		RAISE EXCEPTION 'Seçilen saat dolu (oda veya eğitmen çakışması)';
END;
$$;

REVOKE ALL ON FUNCTION public.pe_move_appointments(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pe_move_enrollments(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pe_reschedule_appointment(bigint, date, smallint, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_move_appointments(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pe_move_enrollments(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pe_reschedule_appointment(bigint, date, smallint, uuid, boolean) TO authenticated;

-- ------------------------------------------------------- pe_extend_purchase
-- Lock the predecessor and refuse one that already has a successor, so two
-- concurrent extends cannot fork the chain.
CREATE OR REPLACE FUNCTION public.pe_extend_purchase(p_predecessor_id uuid, p_reschedule_left integer, p_chunks jsonb)
	RETURNS jsonb
	LANGUAGE plpgsql
	SET search_path TO 'public'
AS $$
DECLARE
	v_package_id uuid;
	v_team_id uuid;
	v_successor uuid;
	v_prev uuid := p_predecessor_id;
	v_chunk jsonb;
	v_new_purchase uuid;
	v_purchases int := 0;
	v_appointments int := 0;
	v_enrollments int := 0;
	v_total int;
	v_session int;
	v_slot jsonb;
	v_appt_id bigint;
	v_inserted int;
BEGIN
	SELECT package_id, team_id, successor_id INTO v_package_id, v_team_id, v_successor
	FROM pe_purchases WHERE id = p_predecessor_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Önceki kayıt bulunamadı';
	END IF;
	IF v_successor IS NOT NULL THEN
		RAISE EXCEPTION 'Bu kayıt zaten uzatılmış';
	END IF;
	IF v_package_id IS NULL OR v_team_id IS NULL THEN
		RAISE EXCEPTION 'Kaydın paket veya öğrenci bilgisi eksik';
	END IF;

	FOR v_chunk IN SELECT * FROM jsonb_array_elements(p_chunks) LOOP
		INSERT INTO pe_purchases (package_id, team_id, reschedule_left)
		VALUES (v_package_id, v_team_id, p_reschedule_left)
		RETURNING id INTO v_new_purchase;

		UPDATE pe_purchases SET successor_id = v_new_purchase WHERE id = v_prev;

		IF v_chunk ? 'slots' THEN
			v_total := jsonb_array_length(v_chunk->'slots');
			v_session := 0;
			FOR v_slot IN SELECT * FROM jsonb_array_elements(v_chunk->'slots') LOOP
				v_session := v_session + 1;
				INSERT INTO pe_appointments (purchase_id, room_id, trainer_id, date, hour)
				VALUES (
					v_new_purchase,
					(v_chunk->>'room_id')::uuid,
					(v_chunk->>'trainer_id')::uuid,
					(v_slot->>'date')::date,
					(v_slot->>'hour')::smallint
				)
				RETURNING id INTO v_appt_id;
				v_appointments := v_appointments + 1;

				INSERT INTO pe_appointment_trainees
					(appointment_id, trainee_id, purchase_id, session_number, total_sessions)
				SELECT v_appt_id, t.trainee_id, v_new_purchase, v_session, v_total
				FROM pe_teams t WHERE t.id = v_team_id;
				GET DIAGNOSTICS v_inserted = ROW_COUNT;
				v_enrollments := v_enrollments + v_inserted;
			END LOOP;
		ELSIF v_chunk ? 'appointment_ids' THEN
			v_total := jsonb_array_length(v_chunk->'appointment_ids');
			v_session := 0;
			FOR v_appt_id IN SELECT (value)::bigint FROM jsonb_array_elements_text(v_chunk->'appointment_ids') LOOP
				v_session := v_session + 1;
				INSERT INTO pe_appointment_trainees
					(appointment_id, trainee_id, purchase_id, session_number, total_sessions)
				SELECT v_appt_id, t.trainee_id, v_new_purchase, v_session, v_total
				FROM pe_teams t WHERE t.id = v_team_id;
				GET DIAGNOSTICS v_inserted = ROW_COUNT;
				v_enrollments := v_enrollments + v_inserted;
			END LOOP;
		ELSE
			RAISE EXCEPTION 'Geçersiz uzatma içeriği';
		END IF;

		v_prev := v_new_purchase;
		v_purchases := v_purchases + 1;
	END LOOP;

	RETURN jsonb_build_object(
		'purchases_created', v_purchases,
		'appointments_created', v_appointments,
		'enrollments_created', v_enrollments
	);
EXCEPTION
	WHEN unique_violation THEN
		RAISE EXCEPTION 'Uzatma saatlerinden biri dolu ya da öğrenci zaten kayıtlı';
END;
$$;
