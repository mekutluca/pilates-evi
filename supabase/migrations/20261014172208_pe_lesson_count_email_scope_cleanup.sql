-- Phase 1 schema cleanup (compatible with the deployed app):
-- - pe_purchases.lesson_count: how many lessons the purchase was sold with. Remaining
--   lessons are counted from future enrollment rows; total_sessions on each enrollment
--   row is a denormalized copy that goes stale once lessons are deleted.
-- - Trainee email unique per studio (case-insensitive) instead of across the shared DB.
-- - Unused objects dropped: pe_logs, the old group-system enums.

-- ------------------------------------------------------------- lesson_count
ALTER TABLE public.pe_purchases ADD COLUMN lesson_count smallint;

UPDATE public.pe_purchases p
SET lesson_count = (
	SELECT max(t.total_sessions) FROM public.pe_appointment_trainees t WHERE t.purchase_id = p.id
);

ALTER TABLE public.pe_purchases
	ALTER COLUMN lesson_count SET NOT NULL,
	ADD CONSTRAINT pe_purchases_lesson_count_positive CHECK (lesson_count > 0);

CREATE OR REPLACE FUNCTION public.pe_create_assignment(
	p_group_lesson jsonb,  -- null | {package_id, room_id, trainer_id, start_date, appointments_created_until, timeslots}
	p_purchases jsonb,     -- [{key, package_id, reschedule_left, trainee_ids: [uuid], extends_key?}]
	                       -- lesson_count = the purchase's total_sessions in p_enrollments
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
	v_predecessor_id uuid;
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
		IF v_item ? 'extends_key' THEN
			v_predecessor_id := (v_purchase_ids->>(v_item->>'extends_key'))::uuid;
			IF v_predecessor_id IS NULL THEN
				RAISE EXCEPTION 'Önceki dönem bulunamadı';
			END IF;
			SELECT team_id INTO v_team_id FROM pe_purchases WHERE id = v_predecessor_id;
		ELSE
			v_predecessor_id := NULL;
			v_team_id := gen_random_uuid();
			FOR v_trainee IN SELECT * FROM jsonb_array_elements_text(v_item->'trainee_ids') LOOP
				INSERT INTO pe_teams (id, trainee_id) VALUES (v_team_id, v_trainee::uuid);
			END LOOP;
		END IF;

		INSERT INTO pe_purchases (package_id, team_id, reschedule_left, lesson_count)
		VALUES (
			(v_item->>'package_id')::uuid,
			v_team_id,
			(v_item->>'reschedule_left')::smallint,
			(SELECT max((e->>'total_sessions')::int)
				FROM jsonb_array_elements(COALESCE(p_enrollments, '[]'::jsonb)) e
				WHERE e->>'purchase_key' = v_item->>'key')
		)
		RETURNING id INTO v_purchase_id;

		IF v_predecessor_id IS NOT NULL THEN
			UPDATE pe_purchases SET successor_id = v_purchase_id WHERE id = v_predecessor_id;
		END IF;

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
EXCEPTION
	WHEN unique_violation THEN
		RAISE EXCEPTION 'Seçilen saatlerden biri dolu ya da öğrenci zaten kayıtlı';
END;
$$;

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
		INSERT INTO pe_purchases (package_id, team_id, reschedule_left, lesson_count)
		VALUES (
			v_package_id,
			v_team_id,
			p_reschedule_left,
			jsonb_array_length(COALESCE(v_chunk->'slots', v_chunk->'appointment_ids'))
		)
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

-- ------------------------------------------------------- email per studio
ALTER TABLE public.pe_trainees DROP CONSTRAINT pe_trainees_email_key;
CREATE UNIQUE INDEX uq_pe_trainees_org_email ON public.pe_trainees (organization_id, lower(email))
	WHERE email IS NOT NULL;

-- ---------------------------------------------------------- unused objects
DROP TABLE public.pe_logs;
DROP TYPE public.day_of_week;
DROP TYPE public.group_type;
