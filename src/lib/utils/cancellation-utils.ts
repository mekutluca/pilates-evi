import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { CancelTraineeAction } from '$lib/types/Schedule';
import { shiftSeriesBySlot, shiftTraineeRecordsBySlot } from '$lib/utils/shift-utils';

type SupabaseClientType = SupabaseClient<Database>;

function isAppointmentFuture(date: string | null, hour: number | null): boolean {
	if (!date || hour === null) return false;
	const appointmentDateTime = new Date(date);
	appointmentDateTime.setHours(hour, 0, 0, 0);
	return appointmentDateTime > new Date();
}

/**
 * Removes an appointment row along with any remaining trainee links. Trainee links are deleted
 * first to avoid leaving orphan `pe_appointment_trainees` rows when the FK lacks ON DELETE CASCADE.
 */
export async function deleteAppointment(
	supabase: SupabaseClientType,
	appointmentId: number
): Promise<{ error: string | null }> {
	const { error: traineeError } = await supabase
		.from('pe_appointment_trainees')
		.delete()
		.eq('appointment_id', appointmentId);

	if (traineeError) {
		return { error: traineeError.message };
	}

	const { error } = await supabase.from('pe_appointments').delete().eq('id', appointmentId);
	if (error) {
		return { error: error.message };
	}
	return { error: null };
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

	const validTrainees = (trainees ?? [])
		.map((t) => t.trainee_id)
		.filter((id): id is string => !!id);

	for (const traineeId of validTrainees) {
		const result = await shiftTraineeRecordsBySlot(supabase, cancelledAppointmentId, traineeId, 1);
		if (result.error) {
			return { error: result.error };
		}
	}

	return { error: null };
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
