import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase, user, userRole } }) => {
	// Ensure authenticated user
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

	// Fetch appointments in the date range for the room or trainer
	const { data: appointments, error: appointmentsError } = await supabase
		.from('pe_appointments')
		.select('id, room_id, trainer_id, date, hour')
		.or(`room_id.eq.${roomId},trainer_id.eq.${trainerId}`)
		.gte('date', startDate)
		.lte('date', endDate);

	if (appointmentsError) {
		throw error(500, 'Failed to fetch appointments');
	}

	return json({
		appointments: appointments || []
	});
};
