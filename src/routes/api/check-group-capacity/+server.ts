import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const roomId = url.searchParams.get('room_id');
	const trainerId = url.searchParams.get('trainer_id');
	const startDate = url.searchParams.get('start_date');
	const endDate = url.searchParams.get('end_date');
	const maxCapacityStr = url.searchParams.get('max_capacity');

	if (!roomId || !trainerId || !startDate || !endDate || !maxCapacityStr) {
		return json({ error: 'Missing required parameters' }, { status: 400 });
	}

	const maxCapacity = parseInt(maxCapacityStr);

	// Get all appointments in the date range for this room and trainer
	const { data: appointments, error } = await supabase
		.from('pe_appointments')
		.select(
			`
			id,
			date,
			hour,
			pe_appointment_trainees(id)
		`
		)
		.eq('room_id', roomId)
		.eq('trainer_id', trainerId)
		.gte('date', startDate)
		.lte('date', endDate);

	if (error) {
		return json({ error: 'Failed to fetch appointments' }, { status: 500 });
	}

	// Check capacity for each appointment
	const capacityIssues: Array<{
		date: string;
		hour: number;
		currentCapacity: number;
		maxCapacity: number;
	}> = [];

	for (const appointment of appointments || []) {
		const currentCapacity = appointment.pe_appointment_trainees?.length || 0;

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
