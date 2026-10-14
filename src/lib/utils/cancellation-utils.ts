import type { SupabaseClientType } from '$lib/types/Supabase';
import type { CancelTraineeAction, ShiftedTraineeRecord } from '$lib/types/Schedule';
import {
	applyEnrollmentMoves,
	checkMoveCapacity,
	planTraineeSlotShift,
	shiftSeriesBySlot
} from '$lib/utils/shift-utils';
import { isAppointmentFuture } from '$lib/utils/date-utils';

/**
 * Removes appointment rows; their trainee links follow via ON DELETE CASCADE. Fails when
 * fewer rows were deleted than asked for, so an RLS-filtered delete never reports success.
 */
export async function deleteAppointments(
	supabase: SupabaseClientType,
	appointmentIds: number[]
): Promise<{ error: string | null }> {
	if (appointmentIds.length === 0) return { error: null };

	const { data, error } = await supabase
		.from('pe_appointments')
		.delete()
		.in('id', appointmentIds)
		.select('id');
	if (error) {
		return { error: error.message };
	}
	if ((data ?? []).length !== appointmentIds.length) {
		return { error: 'Randevular silinemedi; bu işlem için yetkiniz olmayabilir' };
	}
	return { error: null };
}

export function deleteAppointment(
	supabase: SupabaseClientType,
	appointmentId: number
): Promise<{ error: string | null }> {
	return deleteAppointments(supabase, [appointmentId]);
}

function formatConflictMessage(count: number): string {
	return `${count} çakışma tespit edildi. Lütfen önce çakışmaları kontrol edin.`;
}

async function shiftPrivateSeriesByOne(
	supabase: SupabaseClientType,
	cancelledAppointmentId: number
): Promise<{ error: string | null }> {
	const result = await shiftSeriesBySlot(supabase, cancelledAppointmentId, 1);
	if (result.conflicts.length > 0) {
		return { error: formatConflictMessage(result.conflicts.length) };
	}
	return { error: result.error };
}

async function shiftGroupTraineesByOne(
	supabase: SupabaseClientType,
	cancelledAppointmentId: number
): Promise<{ error: string | null }> {
	const { data: trainees } = await supabase
		.from('pe_appointment_trainees')
		.select('trainee_id')
		.eq('appointment_id', cancelledAppointmentId);

	// Plan every trainee before moving anyone, then move them all in one transaction.
	const moves: ShiftedTraineeRecord[] = [];
	for (const { trainee_id } of trainees ?? []) {
		const plan = await planTraineeSlotShift(supabase, cancelledAppointmentId, trainee_id, 1);
		if (plan.error) return { error: plan.error };
		moves.push(...plan.shifted);
	}

	const capacityError = await checkMoveCapacity(supabase, moves);
	if (capacityError) return { error: capacityError };

	return { error: await applyEnrollmentMoves(supabase, moves) };
}

export async function cancelAppointment(
	supabase: SupabaseClientType,
	appointmentId: number,
	traineeAction: CancelTraineeAction | null
): Promise<{ error: string | null }> {
	const { data: appointment, error: fetchError } = await supabase
		.from('pe_appointments')
		.select('id, date, hour, purchase_id, group_lesson_id, pe_appointment_trainees(id)')
		.eq('id', appointmentId)
		.single();

	if (fetchError || !appointment) {
		return { error: 'Randevu bulunamadı' };
	}

	if (!isAppointmentFuture(appointment.date, appointment.hour)) {
		return { error: 'Geçmiş randevular iptal edilemez' };
	}

	const traineeCount = appointment.pe_appointment_trainees?.length ?? 0;

	if (traineeCount === 0) {
		return deleteAppointment(supabase, appointmentId);
	}

	if (!traineeAction) {
		return { error: 'Öğrenciler için işlem seçimi gerekli' };
	}

	if (traineeAction === 'remove') {
		return deleteAppointment(supabase, appointmentId);
	}

	if (appointment.purchase_id) {
		const { error } = await shiftPrivateSeriesByOne(supabase, appointmentId);
		if (error) return { error };
		// The cancelled id has been repurposed at the next slot; nothing to delete.
		return { error: null };
	}

	if (appointment.group_lesson_id) {
		const { error } = await shiftGroupTraineesByOne(supabase, appointmentId);
		if (error) return { error };
		// All trainees have been moved off; the original slot can be deleted safely.
		return deleteAppointment(supabase, appointmentId);
	}

	return { error: 'Randevu için paket veya grup dersi bilgisi yok' };
}
