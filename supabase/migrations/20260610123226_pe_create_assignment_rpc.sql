-- Transactional assignment creation (fixes review §2.4 for new-assignment).
-- The app computes and validates everything (conflicts, capacity, duplicate
-- enrollment), then submits one payload; group lesson, teams, purchases,
-- appointments and enrollments are inserted atomically. Client-side keys
-- correlate purchases/appointments with the enrollments that reference them.
-- SECURITY INVOKER: RLS write policies still apply.
CREATE OR REPLACE FUNCTION public.pe_create_assignment(
	p_group_lesson jsonb,  -- null | {package_id, room_id, trainer_id, start_date, appointments_created_until, timeslots}
	p_purchases jsonb,     -- [{key, package_id, reschedule_left, trainee_ids: [uuid]}] (one team per purchase)
	p_appointments jsonb,  -- [{key, room_id, trainer_id, date, hour, purchase_key?, in_group?}]
	p_enrollments jsonb    -- [{purchase_key, trainee_id, session_number, total_sessions, appointment_id? | appointment_key?}]
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
	v_group_lesson_id uuid;
	v_purchase_ids jsonb := '{}'::jsonb;
	v_appointment_ids jsonb := '{}'::jsonb;
	v_item jsonb;
	v_team_id uuid;
	v_purchase_id uuid;
	v_appt_id bigint;
	v_trainee text;
	v_appointments int := 0;
	v_enrollments int := 0;
BEGIN
	IF p_group_lesson IS NOT NULL AND p_group_lesson <> 'null'::jsonb THEN
		INSERT INTO pe_group_lessons
			(package_id, room_id, trainer_id, start_date, end_date, appointments_created_until, timeslots)
		VALUES (
			(p_group_lesson->>'package_id')::uuid,
			(p_group_lesson->>'room_id')::uuid,
			(p_group_lesson->>'trainer_id')::uuid,
			(p_group_lesson->>'start_date')::date,
			NULL,
			(p_group_lesson->>'appointments_created_until')::date,
			p_group_lesson->'timeslots'
		) RETURNING id INTO v_group_lesson_id;
	END IF;

	FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_purchases, '[]'::jsonb)) LOOP
		v_team_id := gen_random_uuid();
		FOR v_trainee IN SELECT * FROM jsonb_array_elements_text(v_item->'trainee_ids') LOOP
			INSERT INTO pe_teams (id, trainee_id) VALUES (v_team_id, v_trainee::uuid);
		END LOOP;
		INSERT INTO pe_purchases (package_id, team_id, reschedule_left)
		VALUES ((v_item->>'package_id')::uuid, v_team_id, (v_item->>'reschedule_left')::smallint)
		RETURNING id INTO v_purchase_id;
		v_purchase_ids := v_purchase_ids || jsonb_build_object(v_item->>'key', v_purchase_id);
	END LOOP;

	FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_appointments, '[]'::jsonb)) LOOP
		INSERT INTO pe_appointments (room_id, trainer_id, date, hour, purchase_id, group_lesson_id)
		VALUES (
			(v_item->>'room_id')::uuid,
			(v_item->>'trainer_id')::uuid,
			(v_item->>'date')::date,
			(v_item->>'hour')::smallint,
			CASE WHEN v_item->>'purchase_key' IS NOT NULL
				THEN (v_purchase_ids->>(v_item->>'purchase_key'))::uuid END,
			CASE WHEN COALESCE((v_item->>'in_group')::boolean, false) THEN v_group_lesson_id END
		) RETURNING id INTO v_appt_id;
		v_appointment_ids := v_appointment_ids || jsonb_build_object(v_item->>'key', v_appt_id);
		v_appointments := v_appointments + 1;
	END LOOP;

	FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_enrollments, '[]'::jsonb)) LOOP
		INSERT INTO pe_appointment_trainees
			(appointment_id, trainee_id, purchase_id, session_number, total_sessions)
		VALUES (
			COALESCE(
				(v_item->>'appointment_id')::bigint,
				(v_appointment_ids->>(v_item->>'appointment_key'))::bigint
			),
			(v_item->>'trainee_id')::uuid,
			(v_purchase_ids->>(v_item->>'purchase_key'))::uuid,
			(v_item->>'session_number')::smallint,
			(v_item->>'total_sessions')::smallint
		);
		v_enrollments := v_enrollments + 1;
	END LOOP;

	RETURN jsonb_build_object(
		'group_lesson_id', v_group_lesson_id,
		'appointments_created', v_appointments,
		'enrollments_created', v_enrollments
	);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pe_create_assignment(jsonb, jsonb, jsonb, jsonb) FROM anon;
