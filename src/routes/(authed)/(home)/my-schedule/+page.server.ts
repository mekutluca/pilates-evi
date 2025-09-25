import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, user, userRole }, url }) => {
	// Only allow trainer users
	if (!user || userRole !== 'trainer') {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	// Get current trainer ID
	const { data: trainerData, error: trainerError } = await supabase
		.from('pe_trainers')
		.select('id, name')
		.eq('trainer_user_id', user.id)
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

	// Fetch only this trainer's appointments for the current week
	const { data: appointments, error: appointmentsError } = await supabase
		.from('pe_appointments')
		.select(
			`
			*,
			pe_package_groups(
				id,
				pe_rooms(id, name),
				pe_packages(name),
				pe_groups(
					id,
					type,
					pe_trainee_groups(
						pe_trainees(name),
						left_at
					)
				)
			)
		`
		)
		.eq('pe_package_groups.trainer_id', trainerData.id)
		.gte('appointment_date', weekStart.toISOString().split('T')[0])
		.lte('appointment_date', weekEnd.toISOString().split('T')[0])
		.eq('status', 'scheduled')
		.order('appointment_date, hour');

	if (appointmentsError) {
		console.error('Error fetching trainer appointments:', appointmentsError);
	}

	return {
		appointments: appointments || [],
		trainerName: trainerData.name
	};
};