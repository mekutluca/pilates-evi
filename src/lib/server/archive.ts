import { fail } from '@sveltejs/kit';
import type { SupabaseClientType } from '$lib/types/Supabase';
import { formatDateForDB } from '$lib/utils/date-utils';
import { dbErrorMessage } from '$lib/server/db-errors';

/**
 * A room or trainer with lessons from today on can't be archived: they would stay on the
 * board with nothing to book them into. Returns the failure to send, or null when clear.
 */
export async function futureLessonsBlock(
	supabase: SupabaseClientType,
	column: 'room_id' | 'trainer_id',
	id: string,
	blockedMessage: string
) {
	const { data, error } = await supabase
		.from('pe_appointments')
		.select('id')
		.eq(column, id)
		.gte('date', formatDateForDB(new Date()))
		.limit(1);
	if (error) {
		return fail(500, {
			success: false,
			message: dbErrorMessage(error, 'Gelecek randevular kontrol edilemedi. Tekrar deneyin.')
		});
	}
	return (data ?? []).length > 0 ? fail(400, { success: false, message: blockedMessage }) : null;
}
