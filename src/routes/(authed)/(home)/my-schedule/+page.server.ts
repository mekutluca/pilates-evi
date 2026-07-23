import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getWeekStart, getWeekEnd, formatDateForDB } from '$lib/utils/date-utils';
import { TRAINER_APPOINTMENTS_WITH_RELATIONS_SELECT } from '$lib/server/repositories/appointment-repository';

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
	let currentDate = weekParam ? new Date(weekParam) : new Date();

	// If the date is invalid (e.g., from cleared date picker), default to current date
	if (isNaN(currentDate.getTime())) {
		currentDate = new Date();
	}

	// Calculate start and end of the week (Monday to Sunday)
	const weekStart = getWeekStart(currentDate);
	const weekEnd = getWeekEnd(currentDate);

	// Fetch appointments for this trainer for the current week
	const weekStartStr = formatDateForDB(weekStart);
	const weekEndStr = formatDateForDB(weekEnd);

	const { data: appointments, error: appointmentsError } = await supabase
		.from('pe_appointments')
		.select(TRAINER_APPOINTMENTS_WITH_RELATIONS_SELECT)
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
