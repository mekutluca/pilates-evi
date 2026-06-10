import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ConflictService } from '$lib/server/services/conflict-service';
import { isValidUuid } from '$lib/utils/validation';

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
	if (!isValidUuid(roomId) || !isValidUuid(trainerId)) {
		throw error(400, 'Invalid room or trainer id');
	}

	const conflictService = new ConflictService(supabase);
	const appointments = await conflictService.getOccupiedSlots({
		roomId,
		trainerId,
		startDate,
		endDate
	});

	return json({ appointments });
};
