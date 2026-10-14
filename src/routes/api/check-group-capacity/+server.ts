import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isValidUuid } from '$lib/utils/validation';
import type { CapacityIssue } from '$lib/types/Conflict';

export const GET: RequestHandler = async ({ url, locals: { supabase, user, userRole } }) => {
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		throw error(403, 'Unauthorized');
	}

	const roomId = url.searchParams.get('room_id');
	const trainerId = url.searchParams.get('trainer_id');
	const startDate = url.searchParams.get('start_date');
	const endDate = url.searchParams.get('end_date');

	if (!roomId || !trainerId || !startDate || !endDate) {
		throw error(400, 'Missing required parameters');
	}
	if (!isValidUuid(roomId) || !isValidUuid(trainerId)) {
		throw error(400, 'Invalid room or trainer id');
	}

	// Get all group appointments in the date range for this room and trainer, with the
	// capacity of the package each one belongs to
	const { data: appointments, error: fetchError } = await supabase
		.from('pe_appointments')
		.select(
			`
			id,
			date,
			hour,
			pe_appointment_trainees(id),
			pe_group_lessons!inner(pe_packages(max_capacity))
		`
		)
		.eq('room_id', roomId)
		.eq('trainer_id', trainerId)
		.gte('date', startDate)
		.lte('date', endDate);

	if (fetchError) {
		throw error(500, 'Failed to fetch appointments');
	}

	const capacityIssues: CapacityIssue[] = [];

	for (const appointment of appointments ?? []) {
		const maxCapacity = appointment.pe_group_lessons.pe_packages.max_capacity;
		const currentCapacity = appointment.pe_appointment_trainees.length;

		// If adding one more trainee would exceed capacity, it's an issue
		if (currentCapacity >= maxCapacity) {
			capacityIssues.push({
				date: appointment.date,
				hour: appointment.hour,
				currentCapacity,
				maxCapacity
			});
		}
	}

	return json({ capacityIssues });
};
