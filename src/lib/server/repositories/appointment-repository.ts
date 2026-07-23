// Shared pe_appointments select for a trainer's own appointments (room/package/trainee
// relations), used by the dashboard and my-schedule pages. Kept as a plain string rather
// than wrapped in a query-building function — passing it through a function boundary
// causes the Supabase client's join-result type inference to collapse (e.g.
// pe_appointment_trainees.id widens to `number`), so each call site must call
// `.select(TRAINER_APPOINTMENTS_WITH_RELATIONS_SELECT)` directly inline.
export const TRAINER_APPOINTMENTS_WITH_RELATIONS_SELECT = `
	*,
	pe_purchases(
		id,
		reschedule_left,
		successor_id,
		pe_packages(id, name, package_type, reschedulable, weeks_duration, min_lessons_per_week, max_lessons_per_week, max_capacity)
	),
	pe_group_lessons(
		id,
		pe_packages(id, name, package_type, reschedulable, weeks_duration, min_lessons_per_week, max_lessons_per_week, max_capacity)
	),
	pe_rooms(id, name, capacity),
	pe_trainers(id, name),
	pe_appointment_trainees(
		id,
		session_number,
		total_sessions,
		purchase_id,
		pe_trainees(id, name),
		pe_purchases(successor_id)
	)
` as const;
