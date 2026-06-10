-- Transactional purchase extension (fixes review §2.4 for the extend flow).
-- Previously each extension ran purchase insert → successor link → appointment
-- inserts → enrollment inserts as separate requests; a mid-flight failure left
-- orphan rows. This RPC performs the whole extension in one transaction.
--
-- p_chunks: one element per purchase to create, in chronological order.
--   Private extension: {"room_id": uuid, "trainer_id": uuid,
--                       "slots": [{"date": "YYYY-MM-DD", "hour": n}, ...]}
--     → creates the appointments and enrolls the predecessor's team into them.
--   Group extension:   {"appointment_ids": [n, ...]}
--     → enrolls the predecessor's team into the existing group appointments.
-- Slots / appointment ids must be pre-sorted chronologically; session_number
-- follows array order. SECURITY INVOKER: RLS write policies still apply.
CREATE OR REPLACE FUNCTION public.pe_extend_purchase(
	p_predecessor_id uuid,
	p_reschedule_left integer,
	p_chunks jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
	v_package_id uuid;
	v_team_id uuid;
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
	SELECT package_id, team_id INTO v_package_id, v_team_id
	FROM pe_purchases WHERE id = p_predecessor_id;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Önceki satın alma bulunamadı';
	END IF;
	IF v_package_id IS NULL OR v_team_id IS NULL THEN
		RAISE EXCEPTION 'Paket veya takım bilgisi eksik';
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pe_extend_purchase(uuid, integer, jsonb) FROM anon;
