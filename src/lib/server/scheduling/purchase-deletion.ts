import type { SupabaseClientType } from '$lib/types/Supabase';
import type {
	DeleteRemainingLessonsResult,
	RemainingLessonRecord,
	RemainingLessonsScope
} from '$lib/types';
import { deleteAppointments } from '$lib/server/scheduling/cancellation';
import { isAppointmentFuture } from '$lib/utils/date-utils';
import { isNonNull } from '$lib/utils/type-guards';

export const NO_REMAINING_LESSONS = 'Silinecek gelecek ders bulunamadı';

/**
 * Deletes a trainee's upcoming lessons under one purchase. Past lessons are never touched.
 *
 * - Group lessons: only the trainee's own `pe_appointment_trainees` rows go; the group
 *   appointment keeps running for everyone else.
 * - Private lessons, scope `trainee`: the trainee's rows go, and any appointment left with
 *   no trainee at all is deleted so the room/trainer slot frees up.
 * - Private lessons, scope `all`: every affected appointment is deleted along with all of
 *   its trainee rows (teammates lose the lesson too).
 */
export async function deleteRemainingLessons(
	supabase: SupabaseClientType,
	purchaseId: string,
	traineeId: string,
	scope: RemainingLessonsScope
): Promise<DeleteRemainingLessonsResult> {
	const { data: purchase, error: purchaseError } = await supabase
		.from('pe_purchases')
		.select('id, team_id')
		.eq('id', purchaseId)
		.maybeSingle();

	if (purchaseError || !purchase) {
		return { deletedCount: 0, error: 'Satın alım bulunamadı' };
	}

	if (!purchase.team_id) {
		return { deletedCount: 0, error: 'Satın alımın öğrenci kaydı bulunamadı' };
	}

	const { data: membership } = await supabase
		.from('pe_teams')
		.select('id')
		.eq('id', purchase.team_id)
		.eq('trainee_id', traineeId)
		.maybeSingle();

	if (!membership) {
		return { deletedCount: 0, error: 'Öğrenci bu satın alıma kayıtlı değil' };
	}

	const { data: rows, error: rowsError } = await supabase
		.from('pe_appointment_trainees')
		.select('id, pe_appointments!inner(id, date, hour, group_lesson_id)')
		.eq('trainee_id', traineeId)
		.eq('purchase_id', purchaseId);

	if (rowsError) {
		return { deletedCount: 0, error: rowsError.message };
	}

	const remaining: RemainingLessonRecord[] = (rows ?? [])
		.filter((row) => isAppointmentFuture(row.pe_appointments.date, row.pe_appointments.hour))
		.map((row) => ({
			recordId: row.id,
			appointmentId: row.pe_appointments.id,
			isGroup: row.pe_appointments.group_lesson_id !== null
		}));

	if (remaining.length === 0) {
		return { deletedCount: 0, error: NO_REMAINING_LESSONS };
	}

	const groupRecords = remaining.filter((r) => r.isGroup);
	const privateRecords = remaining.filter((r) => !r.isGroup);

	const groupError = await removeRecords(supabase, groupRecords);
	if (groupError) return { deletedCount: 0, error: groupError };

	const privateError =
		scope === 'all'
			? (
					await deleteAppointments(
						supabase,
						privateRecords.map((r) => r.appointmentId)
					)
				).error
			: await removeTraineeFromPrivateAppointments(supabase, privateRecords);
	if (privateError) return { deletedCount: 0, error: privateError };

	return { deletedCount: remaining.length, error: null };
}

async function removeRecords(
	supabase: SupabaseClientType,
	records: RemainingLessonRecord[]
): Promise<string | null> {
	if (records.length === 0) return null;
	const { data, error } = await supabase
		.from('pe_appointment_trainees')
		.delete()
		.in(
			'id',
			records.map((r) => r.recordId)
		)
		.select('id');
	if (error) return error.message;
	if ((data ?? []).length !== records.length) {
		return 'Dersler silinemedi; bu işlem için yetkiniz olmayabilir';
	}
	return null;
}

async function removeTraineeFromPrivateAppointments(
	supabase: SupabaseClientType,
	records: RemainingLessonRecord[]
): Promise<string | null> {
	const removeError = await removeRecords(supabase, records);
	if (removeError || records.length === 0) return removeError;

	// Appointments nobody attends anymore should not keep the room/trainer slot occupied.
	const appointmentIds = records.map((r) => r.appointmentId);
	const { data: stillAttended, error: attendedError } = await supabase
		.from('pe_appointment_trainees')
		.select('appointment_id')
		.in('appointment_id', appointmentIds);
	if (attendedError) return attendedError.message;

	const attendedIds = new Set((stillAttended ?? []).map((r) => r.appointment_id).filter(isNonNull));
	const { error } = await deleteAppointments(
		supabase,
		appointmentIds.filter((id) => !attendedIds.has(id))
	);
	return error;
}
