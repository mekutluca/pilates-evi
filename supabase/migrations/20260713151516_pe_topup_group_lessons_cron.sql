-- Weekly group lesson appointment top-up. New group lessons are created with
-- 26 weeks of appointments (new-assignment/+page.server.ts); this keeps every
-- active lesson's horizon at CURRENT_DATE + p_weeks by generating the missing
-- slots from the lesson's timeslots JSON ({day, hours[]}, English day names).
-- Slots whose room or trainer is already booked are silently skipped via the
-- uq_pe_appointments_room_slot / uq_pe_appointments_trainer_slot unique
-- indexes (ON CONFLICT DO NOTHING) — same "gaps are fine" semantics as the
-- join-existing-lesson flow. organization_id is copied from the lesson; the
-- column default only covers one org. Runs via pg_cron as postgres (table
-- owner, so RLS does not apply); locks the lesson rows so a concurrent
-- pe_end_group_lesson cannot end a lesson mid-top-up.
CREATE OR REPLACE FUNCTION public.pe_topup_group_lesson_appointments(
	p_weeks int DEFAULT 26
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
	v_until date := CURRENT_DATE + p_weeks * 7;
	v_created int;
	v_lessons int;
BEGIN
	WITH lessons AS (
		SELECT id, room_id, trainer_id, organization_id, timeslots,
			GREATEST(appointments_created_until, CURRENT_DATE) AS from_date
		FROM pe_group_lessons
		WHERE end_date IS NULL
			AND appointments_created_until IS NOT NULL
			AND appointments_created_until < v_until
			AND room_id IS NOT NULL
			AND trainer_id IS NOT NULL
			AND jsonb_typeof(timeslots) = 'array'
		FOR UPDATE
	),
	slots AS (
		SELECT l.id AS group_lesson_id, l.room_id, l.trainer_id,
			l.organization_id, d::date AS date, h.hour::smallint AS hour
		FROM lessons l
		CROSS JOIN LATERAL jsonb_array_elements(l.timeslots) AS ts(slot)
		CROSS JOIN LATERAL (
			SELECT elem::int AS hour
			FROM jsonb_array_elements_text(ts.slot->'hours') AS elem
		) h
		CROSS JOIN LATERAL generate_series(l.from_date, v_until - 1, interval '1 day') AS d
		WHERE (ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])
			[EXTRACT(ISODOW FROM d)::int] = lower(ts.slot->>'day')
	),
	inserted AS (
		INSERT INTO pe_appointments
			(room_id, trainer_id, date, hour, group_lesson_id, organization_id)
		SELECT room_id, trainer_id, date, hour, group_lesson_id, organization_id
		FROM slots
		ON CONFLICT DO NOTHING
		RETURNING 1
	),
	updated AS (
		UPDATE pe_group_lessons gl
		SET appointments_created_until = v_until
		FROM lessons l
		WHERE gl.id = l.id
		RETURNING 1
	)
	SELECT (SELECT count(*) FROM inserted), (SELECT count(*) FROM updated)
	INTO v_created, v_lessons;

	RETURN jsonb_build_object(
		'lessons_extended', COALESCE(v_lessons, 0),
		'appointments_created', COALESCE(v_created, 0),
		'created_until', v_until
	);
END;
$$;

-- Maintenance function for the cron job only — not callable from the app.
REVOKE EXECUTE ON FUNCTION public.pe_topup_group_lesson_appointments(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pe_topup_group_lesson_appointments(int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pe_topup_group_lesson_appointments(int) FROM authenticated;

-- Every Monday 03:00 UTC (06:00 Turkey). cron.schedule upserts by job name.
SELECT cron.schedule(
	'Weekly group lesson appointment top-up',
	'0 3 * * 1',
	$job$SELECT public.pe_topup_group_lesson_appointments(26);$job$
);
