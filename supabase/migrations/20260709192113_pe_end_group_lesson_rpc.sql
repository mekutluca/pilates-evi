-- Transactional group lesson termination. Sets end_date and removes the
-- pre-created appointments from that date on in one transaction. The end date
-- must fall strictly after the lesson's last appointment that has enrolled
-- trainees, so no trainee session is ever deleted. The delete additionally
-- re-checks emptiness per row: pe_appointment_trainees.appointment_id is
-- ON DELETE SET NULL, so deleting an enrolled appointment would silently
-- orphan its enrollments.
-- SECURITY INVOKER: RLS write policies still apply.
CREATE OR REPLACE FUNCTION public.pe_end_group_lesson(
	p_group_lesson_id uuid,
	p_end_date date
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
	v_end_date date;
	v_last_enrolled date;
	v_deleted int;
BEGIN
	SELECT end_date INTO v_end_date
	FROM pe_group_lessons
	WHERE id = p_group_lesson_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'Grup dersi bulunamadı';
	END IF;
	IF v_end_date IS NOT NULL THEN
		RAISE EXCEPTION 'Grup dersi zaten sonlandırılmış';
	END IF;
	IF p_end_date <= CURRENT_DATE THEN
		RAISE EXCEPTION 'Bitiş tarihi gelecekte olmalıdır';
	END IF;

	SELECT MAX(a.date) INTO v_last_enrolled
	FROM pe_appointments a
	WHERE a.group_lesson_id = p_group_lesson_id
		AND EXISTS (
			SELECT 1 FROM pe_appointment_trainees t WHERE t.appointment_id = a.id
		);
	IF v_last_enrolled IS NOT NULL AND p_end_date <= v_last_enrolled THEN
		RAISE EXCEPTION 'Bitiş tarihi son dolu randevudan (%) sonra olmalıdır', v_last_enrolled;
	END IF;

	DELETE FROM pe_appointments a
	WHERE a.group_lesson_id = p_group_lesson_id
		AND a.date >= p_end_date
		AND NOT EXISTS (
			SELECT 1 FROM pe_appointment_trainees t WHERE t.appointment_id = a.id
		);
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	UPDATE pe_group_lessons
	SET end_date = p_end_date
	WHERE id = p_group_lesson_id;

	RETURN jsonb_build_object('deleted_count', v_deleted);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pe_end_group_lesson(uuid, date) FROM anon;
