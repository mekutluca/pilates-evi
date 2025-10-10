import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, user, userRole }, url }) => {
	// Only allow trainer users
	if (!user || userRole !== 'trainer') {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	// Get current trainer ID (trainer.id is the auth user id)
	const { data: trainerData, error: trainerError } = await supabase
		.from('pe_trainers')
		.select('id, name')
		.eq('id', user.id)
		.single();

	if (trainerError || !trainerData) {
		throw error(404, 'Eğitmen kaydınız bulunamadı');
	}

	// Get week parameter from URL or default to current week
	const weekParam = url.searchParams.get('week');
	const currentDate = weekParam ? new Date(weekParam) : new Date();

	// Calculate start and end of the week (Monday to Sunday)
	const weekStart = new Date(currentDate);
	const day = weekStart.getDay();
	const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
	weekStart.setDate(diff);
	weekStart.setHours(0, 0, 0, 0);

	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekStart.getDate() + 6);
	weekEnd.setHours(23, 59, 59, 999);

	// Fetch appointments for this trainer for the current week
	const weekStartStr = weekStart.toISOString().split('T')[0];
	const weekEndStr = weekEnd.toISOString().split('T')[0];

	const { data: appointments, error: appointmentsError } = await supabase
		.from('pe_appointments')
		.select(
			`
			*,
			pe_purchases(
				id,
				reschedule_left,
				pe_packages(id, name, package_type, reschedulable, weeks_duration, lessons_per_week)
			),
			pe_group_lessons(
				id,
				pe_packages(id, name, package_type, reschedulable, weeks_duration, lessons_per_week)
			),
			pe_rooms(id, name, capacity),
			pe_trainers(id, name),
			pe_appointment_trainees(
				id,
				session_number,
				total_sessions,
				pe_trainees(id, name)
			)
		`
		)
		.eq('trainer_id', trainerData.id)
		.gte('date', weekStartStr)
		.lte('date', weekEndStr)
		.order('date', { ascending: true })
		.order('hour', { ascending: true });

	if (appointmentsError) {
		console.error('Error fetching trainer appointments:', appointmentsError);
	}

	return {
		appointments: appointments || [],
		trainerName: trainerData.name,
		trainerId: trainerData.id
	};
};
