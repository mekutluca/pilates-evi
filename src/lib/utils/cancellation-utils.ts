import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { CancelTraineeAction, DayOfWeek } from '$lib/types/Schedule';
import { getPurchaseSuccessorChain } from '$lib/utils/extension-utils';
import { buildAppointmentSlots, getDayOfWeekFromDate } from '$lib/utils/date-utils';

type SupabaseClientType = SupabaseClient<Database>;

interface CancelTargetAppointment {
	id: number;
	date: string | null;
	hour: number | null;
	purchase_id: string | null;
	group_lesson_id: string | null;
}

interface AppointmentSlot {
	id: number;
	date: string;
	hour: number;
}

interface TraineeRecord {
	id: number;
	appointment_id: number | null;
	trainee_id: string | null;
	purchase_id: string | null;
	pe_appointments: {
		date: string | null;
		hour: number | null;
		group_lesson_id: string | null;
	} | null;
}

function isAppointmentFuture(date: string | null, hour: number | null): boolean {
	if (!date || hour === null) return false;
	const appointmentDateTime = new Date(date);
	appointmentDateTime.setHours(hour, 0, 0, 0);
	return appointmentDateTime > new Date();
}

async function deleteAppointment(
	supabase: SupabaseClientType,
	appointmentId: number
): Promise<{ error: string | null }> {
	// Trainee links are removed first to avoid leaving orphan rows even if the
	// appointment FK is missing ON DELETE CASCADE.
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

async function getFuturePrivateSlots(
	supabase: SupabaseClientType,
	purchaseId: string,
	fromDate: string,
	fromHour: number
): Promise<AppointmentSlot[]> {
	const chain = await getPurchaseSuccessorChain(supabase, purchaseId);
	const { data } = await supabase
		.from('pe_appointments')
		.select('id, date, hour')
		.in('purchase_id', chain)
		.or(`date.gt.${fromDate},and(date.eq.${fromDate},hour.gte.${fromHour})`)
		.order('date', { ascending: true })
		.order('hour', { ascending: true });

	return (data || [])
		.filter((a): a is { id: number; date: string; hour: number } => !!a.date && a.hour !== null)
		.map((a) => ({ id: a.id, date: a.date, hour: a.hour }));
}

// Mirrors transfer's shift_by_slot for slots=1: each appointment from `cancelled` onwards
// in the purchase chain takes the date/hour of the next slot in the recurring pattern; the
// last appointment is pushed onto a brand-new slot. The cancelled date is left empty.
async function shiftPrivateSeriesByOne(
	supabase: SupabaseClientType,
	cancelled: CancelTargetAppointment
): Promise<{ error: string | null }> {
	if (!cancelled.purchase_id || !cancelled.date || cancelled.hour === null) {
		return { error: 'Geçersiz randevu bilgisi' };
	}

	const futureAppointments = await getFuturePrivateSlots(
		supabase,
		cancelled.purchase_id,
		cancelled.date,
		cancelled.hour
	);

	if (futureAppointments.length === 0) {
		return { error: 'Kaydırılacak randevu bulunamadı' };
	}

	const seenSlots = new Set<string>();
	const timeSlots: Array<{ day: DayOfWeek; hour: number }> = [];
	for (const apt of futureAppointments) {
		const day = getDayOfWeekFromDate(apt.date) as DayOfWeek;
		const slotKey = `${day}-${apt.hour}`;
		if (!seenSlots.has(slotKey)) {
			seenSlots.add(slotKey);
			timeSlots.push({ day, hour: apt.hour });
		}
	}

	const firstAppointmentDate = new Date(futureAppointments[0].date);
	const totalSlotsNeeded = futureAppointments.length + 1;
	const allSlots = buildAppointmentSlots(timeSlots, firstAppointmentDate, totalSlotsNeeded);

	const shiftMap = futureAppointments.map((apt, i) => ({
		id: apt.id,
		newDate: allSlots[i + 1].date,
		newHour: allSlots[i + 1].hour
	}));

	// Reverse order avoids transient (room, date, hour) collisions inside the series.
	for (const shift of [...shiftMap].reverse()) {
		const { error } = await supabase
			.from('pe_appointments')
			.update({ date: shift.newDate, hour: shift.newHour })
			.eq('id', shift.id);
		if (error) return { error: error.message };
	}

	return { error: null };
}

async function getTraineeRecordsInChain(
	supabase: SupabaseClientType,
	traineeId: string,
	purchaseId: string
): Promise<TraineeRecord[]> {
	const chain = await getPurchaseSuccessorChain(supabase, purchaseId);
	const { data } = await supabase
		.from('pe_appointment_trainees')
		.select(
			'id, appointment_id, trainee_id, purchase_id, pe_appointments(date, hour, group_lesson_id)'
		)
		.eq('trainee_id', traineeId)
		.in('purchase_id', chain);

	return (data || []) as TraineeRecord[];
}

// Mirrors transfer's shift_trainee_by_slot for slots=1: each of the trainee's records
// from the cancelled appointment onwards moves onto the next group-lesson appointment
// that matches the trainee's own slot pattern (not the group's full canonical schedule),
// so a Wed/Thu trainee in an every-day group lands on the next Wed, not Friday.
async function shiftTraineeForwardByOne(
	supabase: SupabaseClientType,
	cancelled: CancelTargetAppointment,
	traineeId: string,
	purchaseId: string
): Promise<{ error: string | null }> {
	if (!cancelled.group_lesson_id || !cancelled.date) {
		return { error: 'Geçersiz randevu bilgisi' };
	}

	const records = await getTraineeRecordsInChain(supabase, traineeId, purchaseId);
	const sortedRecords = records
		.filter((r) => r.pe_appointments?.date && r.pe_appointments?.hour !== null)
		.sort((a, b) => {
			const dc = (a.pe_appointments?.date ?? '').localeCompare(b.pe_appointments?.date ?? '');
			if (dc !== 0) return dc;
			return (a.pe_appointments?.hour ?? 0) - (b.pe_appointments?.hour ?? 0);
		});

	const startIndex = sortedRecords.findIndex((r) => r.appointment_id === cancelled.id);
	if (startIndex === -1) {
		return { error: 'Öğrenci kaydı bulunamadı' };
	}

	// Build the trainee's actual (day, hour) pattern within the cancelled group lesson.
	// A purchase chain can span multiple group lessons, so cross-group records are excluded
	// from the pattern — they belong to a different recurring schedule.
	const traineeSlotKeys = new Set<string>();
	for (const record of sortedRecords) {
		const apt = record.pe_appointments;
		if (!apt?.date || apt.hour === null) continue;
		if (apt.group_lesson_id !== cancelled.group_lesson_id) continue;
		traineeSlotKeys.add(`${getDayOfWeekFromDate(apt.date)}-${apt.hour}`);
	}

	const { data: groupAppts } = await supabase
		.from('pe_appointments')
		.select('id, date, hour')
		.eq('group_lesson_id', cancelled.group_lesson_id)
		.gte('date', cancelled.date)
		.order('date', { ascending: true })
		.order('hour', { ascending: true });

	const eligibleAppointments: AppointmentSlot[] = (groupAppts || [])
		.filter((a): a is { id: number; date: string; hour: number } => !!a.date && a.hour !== null)
		.filter((a) => traineeSlotKeys.has(`${getDayOfWeekFromDate(a.date)}-${a.hour}`))
		.map((a) => ({ id: a.id, date: a.date, hour: a.hour }));

	const recordsToShift = sortedRecords.slice(startIndex);

	const shiftMap: Array<{ recordId: number; newAppointmentId: number }> = [];
	for (const record of recordsToShift) {
		const currentIdx = eligibleAppointments.findIndex((a) => a.id === record.appointment_id);
		if (currentIdx === -1) continue;
		const targetIdx = currentIdx + 1;
		if (targetIdx >= eligibleAppointments.length) {
			return {
				error: 'Kaydırma için yeterli ileri tarihli grup dersi randevusu yok'
			};
		}
		shiftMap.push({ recordId: record.id, newAppointmentId: eligibleAppointments[targetIdx].id });
	}

	for (const shift of [...shiftMap].reverse()) {
		const { error } = await supabase
			.from('pe_appointment_trainees')
			.update({ appointment_id: shift.newAppointmentId })
			.eq('id', shift.recordId);
		if (error) return { error: error.message };
	}

	return { error: null };
}

async function shiftGroupTraineesByOne(
	supabase: SupabaseClientType,
	cancelled: CancelTargetAppointment
): Promise<{ error: string | null }> {
	if (!cancelled.group_lesson_id || !cancelled.date) {
		return { error: 'Geçersiz randevu bilgisi' };
	}

	const { data: trainees } = await supabase
		.from('pe_appointment_trainees')
		.select('trainee_id, purchase_id')
		.eq('appointment_id', cancelled.id);

	const validTrainees = (trainees || []).filter(
		(t): t is { trainee_id: string; purchase_id: string } => !!t.trainee_id && !!t.purchase_id
	);

	if (validTrainees.length === 0) {
		return { error: null };
	}

	for (const trainee of validTrainees) {
		const { error } = await shiftTraineeForwardByOne(
			supabase,
			cancelled,
			trainee.trainee_id,
			trainee.purchase_id
		);
		if (error) return { error };
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

	const cancelled: CancelTargetAppointment = {
		id: appointment.id,
		date: appointment.date,
		hour: appointment.hour,
		purchase_id: appointment.purchase_id,
		group_lesson_id: appointment.group_lesson_id
	};

	if (cancelled.purchase_id) {
		const { error } = await shiftPrivateSeriesByOne(supabase, cancelled);
		if (error) return { error };
		// The cancelled id has been repurposed at the next slot; nothing to delete.
		return { error: null };
	}

	if (cancelled.group_lesson_id) {
		const { error } = await shiftGroupTraineesByOne(supabase, cancelled);
		if (error) return { error };
		// All trainees have been moved off; the original slot can be deleted safely.
		return deleteAppointment(supabase, appointmentId);
	}

	return { error: 'Randevu için paket veya grup dersi bilgisi yok' };
}
