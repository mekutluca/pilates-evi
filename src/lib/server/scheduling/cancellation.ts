import type { SupabaseClientType } from '$lib/types/Supabase';
import type {
	CancelTraineeAction,
	ChangeOutcome,
	OperationResult,
	ShiftedTraineeRecord
} from '$lib/types/Schedule';
import type { ScheduleChange } from '$lib/types/WhatsApp';
import { NotificationService } from '$lib/server/services/notification-service';
import {
	applyEnrollmentMoves,
	checkMoveCapacity,
	planTraineeSlotShift,
	shiftSeriesBySlot
} from '$lib/server/scheduling/shift';
import { isAppointmentFuture } from '$lib/utils/date-utils';
import { dbErrorMessage } from '$lib/server/db-errors';

/**
 * Removes appointment rows; their trainee links follow via ON DELETE CASCADE. Fails when
 * fewer rows were deleted than asked for, so an RLS-filtered delete never reports success.
 */
export async function deleteAppointments(
	supabase: SupabaseClientType,
	appointmentIds: number[]
): Promise<OperationResult> {
	if (appointmentIds.length === 0) return { error: null };

	const { data, error } = await supabase
		.from('pe_appointments')
		.delete()
		.in('id', appointmentIds)
		.select('id');
	if (error) {
		return {
			error: dbErrorMessage(error, 'Randevu silinemedi. Sayfayı yenileyip tekrar deneyin.')
		};
	}
	if ((data ?? []).length !== appointmentIds.length) {
		return { error: 'Randevular silinemedi; bu işlem için yetkiniz olmayabilir' };
	}
	return { error: null };
}

export function deleteAppointment(
	supabase: SupabaseClientType,
	appointmentId: number
): Promise<OperationResult> {
	return deleteAppointments(supabase, [appointmentId]);
}

function formatConflictMessage(count: number): string {
	return `${count} çakışma tespit edildi. Lütfen önce çakışmaları kontrol edin.`;
}

async function shiftPrivateSeriesByOne(
	supabase: SupabaseClientType,
	cancelledAppointmentId: number
): Promise<ChangeOutcome> {
	const result = await shiftSeriesBySlot(supabase, cancelledAppointmentId, 1);
	if (result.conflicts.length > 0) {
		return { error: formatConflictMessage(result.conflicts.length), changes: [] };
	}
	if (result.error) return { error: result.error, changes: [] };
	return { error: null, changes: NotificationService.changesFromMoves(result.moved) };
}

/**
 * Moves every trainee of a group appointment one slot on in their own pattern and removes
 * the emptied appointment (cancelling a group lesson, alone or as part of a closed day).
 * All trainees are planned first, then moved and the appointment deleted in one
 * transaction: a failure leaves everything as it was.
 */
export async function shiftGroupTraineesOn(
	supabase: SupabaseClientType,
	appointmentId: number
): Promise<ChangeOutcome> {
	const { data: appointment } = await supabase
		.from('pe_appointments')
		.select(
			'date, hour, pe_group_lessons(pe_packages(name)), pe_appointment_trainees(trainee_id, pe_trainees(phone))'
		)
		.eq('id', appointmentId)
		.maybeSingle();
	if (!appointment) return { error: 'Randevu bulunamadı', changes: [] };

	const moves: ShiftedTraineeRecord[] = [];
	const phoneByTarget: Array<{ phone: string; newAppointmentId: number }> = [];
	for (const enrollment of appointment.pe_appointment_trainees) {
		const plan = await planTraineeSlotShift(supabase, appointmentId, enrollment.trainee_id, 1);
		if (plan.error) return { error: plan.error, changes: [] };
		moves.push(...plan.shifted);
		const own = plan.shifted.find((r) => r.oldAppointmentId === appointmentId);
		if (own) {
			phoneByTarget.push({
				phone: enrollment.pe_trainees.phone,
				newAppointmentId: own.newAppointmentId
			});
		}
	}

	const capacityError = await checkMoveCapacity(supabase, moves);
	if (capacityError) return { error: capacityError, changes: [] };
	const { data: targets } = await supabase
		.from('pe_appointments')
		.select('id, date, hour')
		.in('id', [...new Set(phoneByTarget.map((p) => p.newAppointmentId))]);
	const targetById = new Map((targets ?? []).map((t) => [t.id, t]));
	const packageName = appointment.pe_group_lessons?.pe_packages.name ?? '';
	const changes: ScheduleChange[] = phoneByTarget.flatMap(({ phone, newAppointmentId }) => {
		const target = targetById.get(newAppointmentId);
		return target
			? [
					{
						phone,
						packageName,
						oldDate: appointment.date,
						oldHour: appointment.hour,
						newDate: target.date,
						newHour: target.hour
					}
				]
			: [];
	});

	// The trainees move and the emptied appointment goes in one transaction
	const moveError = await applyEnrollmentMoves(supabase, moves, [appointmentId]);
	return moveError ? { error: moveError, changes: [] } : { error: null, changes };
}

/**
 * Cancels one appointment. Its trainees either lose the lesson (`remove`) or have their
 * lessons shifted one slot on (`shift`); the schedule changes of a shift are returned so
 * the caller can tell the trainees.
 */
export async function cancelAppointment(
	supabase: SupabaseClientType,
	appointmentId: number,
	traineeAction: CancelTraineeAction | null
): Promise<ChangeOutcome> {
	const { data: appointment, error: fetchError } = await supabase
		.from('pe_appointments')
		.select('id, date, hour, purchase_id, group_lesson_id, pe_appointment_trainees(id)')
		.eq('id', appointmentId)
		.single();

	if (fetchError || !appointment) {
		return { error: 'Randevu bulunamadı', changes: [] };
	}

	if (!isAppointmentFuture(appointment.date, appointment.hour)) {
		return { error: 'Geçmiş randevular iptal edilemez', changes: [] };
	}

	if (appointment.pe_appointment_trainees.length > 0 && !traineeAction) {
		return { error: 'Öğrenciler için işlem seçimi gerekli', changes: [] };
	}

	if (appointment.pe_appointment_trainees.length === 0 || traineeAction === 'remove') {
		return { ...(await deleteAppointment(supabase, appointmentId)), changes: [] };
	}

	// The cancelled id is repurposed at the next slot of a private series; a group
	// appointment is emptied and deleted
	if (appointment.purchase_id) return shiftPrivateSeriesByOne(supabase, appointmentId);
	if (appointment.group_lesson_id) return shiftGroupTraineesOn(supabase, appointmentId);

	return { error: 'Randevu için paket veya grup dersi bilgisi yok', changes: [] };
}
