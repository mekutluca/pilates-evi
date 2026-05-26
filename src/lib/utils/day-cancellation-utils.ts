import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { ShiftConflict, ShiftedAppointment } from '$lib/types/Schedule';
import type { ShiftNotificationEntry } from '$lib/types/WhatsApp';
import type {
	DayCancellationConflict,
	DayCancellationResult,
	DayCancellationStrategy
} from '$lib/types/Operation';
import { shiftSeriesBySlot, shiftTraineeRecordsBySlot } from '$lib/utils/shift-utils';
import { formatShortTurkishDateTime } from '$lib/utils/date-utils';

type SupabaseClientType = SupabaseClient<Database>;

// How far ahead the "closest free occurrence" search walks through the recurring pattern
// before giving up (≈ six months for a weekly slot).
const CLOSEST_PROBE_LIMIT = 26;

interface DayTrainee {
	traineeId: string;
	name: string;
	phone: string | null;
}

interface DayAppointment {
	id: number;
	date: string;
	hour: number;
	purchaseId: string | null;
	groupLessonId: string | null;
	roomName: string;
	trainerName: string;
	packageName: string;
	trainees: DayTrainee[];
}

interface RawDayRow {
	id: number;
	date: string | null;
	hour: number | null;
	purchase_id: string | null;
	group_lesson_id: string | null;
	pe_rooms: { name: string | null } | null;
	pe_trainers: { name: string | null } | null;
	pe_purchases: { pe_packages: { name: string | null } | null } | null;
	pe_group_lessons: { pe_packages: { name: string | null } | null } | null;
	pe_appointment_trainees: Array<{
		trainee_id: string | null;
		pe_trainees: { name: string | null; phone: string | null } | null;
	}>;
}

const DAY_APPOINTMENT_SELECT = `
	id, date, hour, purchase_id, group_lesson_id,
	pe_rooms(name),
	pe_trainers(name),
	pe_purchases(pe_packages(name)),
	pe_group_lessons(pe_packages(name)),
	pe_appointment_trainees(trainee_id, pe_trainees(name, phone))
`;

function isFuture(date: string, hour: number): boolean {
	const dt = new Date(date);
	dt.setHours(hour, 0, 0, 0);
	return dt > new Date();
}

async function getDayAppointments(
	supabase: SupabaseClientType,
	date: string
): Promise<DayAppointment[]> {
	const { data } = await supabase
		.from('pe_appointments')
		.select(DAY_APPOINTMENT_SELECT)
		.eq('date', date)
		.order('hour', { ascending: true });

	const rows = (data as RawDayRow[] | null) ?? [];
	const appointments: DayAppointment[] = [];
	for (const row of rows) {
		if (!row.date || row.hour === null) continue;
		appointments.push({
			id: row.id,
			date: row.date,
			hour: row.hour,
			purchaseId: row.purchase_id,
			groupLessonId: row.group_lesson_id,
			roomName: row.pe_rooms?.name ?? '',
			trainerName: row.pe_trainers?.name ?? '',
			packageName:
				row.pe_purchases?.pe_packages?.name ?? row.pe_group_lessons?.pe_packages?.name ?? '',
			trainees: (row.pe_appointment_trainees ?? [])
				.filter((t) => t.trainee_id)
				.map((t) => ({
					traineeId: t.trainee_id as string,
					name: t.pe_trainees?.name ?? '',
					phone: t.pe_trainees?.phone ?? null
				}))
		});
	}
	return appointments;
}

function describeAppointment(appt: DayAppointment): string {
	const when = formatShortTurkishDateTime(appt.date, appt.hour);
	return appt.packageName ? `${when} ${appt.packageName}` : when;
}

function buildPrivateConflict(
	appt: DayAppointment,
	conflicts: ShiftConflict[],
	reasonOverride?: string
): DayCancellationConflict {
	const roomBusy = conflicts.some((c) => c.roomConflict);
	const trainerBusy = conflicts.some((c) => c.trainerConflict);
	const reason =
		reasonOverride ??
		(roomBusy && trainerBusy ? 'Oda ve eğitmen dolu' : roomBusy ? 'Oda dolu' : 'Eğitmen dolu');
	return {
		appointmentId: appt.id,
		date: appt.date,
		hour: appt.hour,
		roomName: appt.roomName,
		trainerName: appt.trainerName,
		packageName: appt.packageName,
		traineeNames: appt.trainees.map((t) => t.name),
		reason
	};
}

function buildNotifications(
	appt: DayAppointment,
	newDate: string,
	newHour: number
): ShiftNotificationEntry[] {
	const oldDateTime = formatShortTurkishDateTime(appt.date, appt.hour);
	const newDateTime = formatShortTurkishDateTime(newDate, newHour);
	return appt.trainees
		.filter((t): t is DayTrainee & { phone: string } => !!t.phone)
		.map((t) => ({ phone: t.phone, oldDateTime, newDateTime, packageName: appt.packageName }));
}

interface ShiftOutcome {
	shifted: boolean;
	notifications: ShiftNotificationEntry[];
	conflict?: DayCancellationConflict;
	error?: string;
}

function shiftedOutcome(appt: DayAppointment, shifted: ShiftedAppointment[]): ShiftOutcome {
	const moved = shifted.find((s) => s.id === appt.id);
	const notifications = moved ? buildNotifications(appt, moved.newDate, moved.newHour) : [];
	return { shifted: true, notifications };
}

// Shifts a private (purchase-backed) appointment's whole series forward, mirroring a single
// appointment cancellation. The target slot is checked for room/trainer conflicts:
// - 'shift'   : shift by one slot; on a conflict nothing moves and it is reported to resolve.
// - 'force'   : shift by one slot even if the target slot conflicts (user accepted the overlap).
// - 'closest' : walk forward through the recurring pattern to the first conflict-free occurrence.
async function shiftPrivateAppointment(
	supabase: SupabaseClientType,
	appt: DayAppointment,
	strategy: DayCancellationStrategy
): Promise<ShiftOutcome> {
	if (strategy === 'force') {
		const result = await shiftSeriesBySlot(supabase, appt.id, 1, { force: true });
		if (result.error) return { shifted: false, notifications: [], error: result.error };
		return shiftedOutcome(appt, result.shifted);
	}

	if (strategy === 'closest') {
		let lastConflicts: ShiftConflict[] = [];
		for (let slots = 1; slots <= CLOSEST_PROBE_LIMIT; slots++) {
			const result = await shiftSeriesBySlot(supabase, appt.id, slots);
			if (result.error) return { shifted: false, notifications: [], error: result.error };
			if (result.conflicts.length === 0) return shiftedOutcome(appt, result.shifted);
			lastConflicts = result.conflicts;
		}
		return {
			shifted: false,
			notifications: [],
			conflict: buildPrivateConflict(appt, lastConflicts, 'Uygun boş randevu bulunamadı')
		};
	}

	const result = await shiftSeriesBySlot(supabase, appt.id, 1);
	if (result.error) return { shifted: false, notifications: [], error: result.error };
	if (result.conflicts.length > 0) {
		return {
			shifted: false,
			notifications: [],
			conflict: buildPrivateConflict(appt, result.conflicts)
		};
	}
	return shiftedOutcome(appt, result.shifted);
}

async function deleteEmptyAppointment(
	supabase: SupabaseClientType,
	appointmentId: number
): Promise<void> {
	await supabase.from('pe_appointment_trainees').delete().eq('appointment_id', appointmentId);
	await supabase.from('pe_appointments').delete().eq('id', appointmentId);
}

// Shifts each trainee on a group appointment forward by one slot within their own pattern, then
// removes the now-empty original slot — exactly how a single group appointment is cancelled. Group
// appointments target pre-existing slots, so they never produce room/trainer conflicts; a trainee
// with no future slot to move into surfaces as an error instead.
async function shiftGroupAppointment(
	supabase: SupabaseClientType,
	appt: DayAppointment
): Promise<ShiftOutcome> {
	const moved: Array<{ trainee: DayTrainee; newAppointmentId: number }> = [];
	for (const trainee of appt.trainees) {
		const result = await shiftTraineeRecordsBySlot(supabase, appt.id, trainee.traineeId, 1);
		if (result.error) {
			return { shifted: false, notifications: [], error: result.error };
		}
		const record = result.shifted.find((r) => r.oldAppointmentId === appt.id);
		if (record) moved.push({ trainee, newAppointmentId: record.newAppointmentId });
	}

	const newSlotById = new Map<number, { date: string; hour: number }>();
	const newIds = [...new Set(moved.map((m) => m.newAppointmentId))];
	if (newIds.length > 0) {
		const { data } = await supabase
			.from('pe_appointments')
			.select('id, date, hour')
			.in('id', newIds);
		for (const row of data ?? []) {
			if (row.date && row.hour !== null)
				newSlotById.set(row.id, { date: row.date, hour: row.hour });
		}
	}

	const oldDateTime = formatShortTurkishDateTime(appt.date, appt.hour);
	const notifications: ShiftNotificationEntry[] = [];
	for (const { trainee, newAppointmentId } of moved) {
		const slot = newSlotById.get(newAppointmentId);
		if (!trainee.phone || !slot) continue;
		notifications.push({
			phone: trainee.phone,
			oldDateTime,
			newDateTime: formatShortTurkishDateTime(slot.date, slot.hour),
			packageName: appt.packageName
		});
	}

	await deleteEmptyAppointment(supabase, appt.id);
	return { shifted: true, notifications };
}

/**
 * Cancels a whole day: every future appointment on `date` that has trainees is shifted forward
 * using the same machinery as a single appointment cancellation, so no trainee session is lost.
 *
 * The initial pass (`strategy: 'shift'`) skips appointments whose target slot conflicts with
 * another room/trainer booking and returns them in `conflicts` for the user to resolve. A
 * follow-up call with `appointmentIds` restricted to those conflicts and `strategy: 'force'`
 * (shift anyway) or `'closest'` (nearest free occurrence) resolves them. Empty slots are left
 * untouched.
 *
 * Notifications for the shifted appointments are returned (not sent) so the caller can dispatch
 * them with the WhatsApp repository and the user-supplied cause.
 */
export async function cancelDay(
	supabase: SupabaseClientType,
	params: { date: string; appointmentIds?: number[]; strategy?: DayCancellationStrategy }
): Promise<DayCancellationResult> {
	const strategy = params.strategy ?? 'shift';
	const idFilter = params.appointmentIds ? new Set(params.appointmentIds) : null;
	const appointments = await getDayAppointments(supabase, params.date);

	const result: DayCancellationResult = {
		shiftedCount: 0,
		conflicts: [],
		notifications: [],
		warnings: [],
		error: null
	};

	for (const appt of appointments) {
		if (idFilter && !idFilter.has(appt.id)) continue;
		if (!isFuture(appt.date, appt.hour)) continue;
		if (appt.trainees.length === 0) continue;

		let outcome: ShiftOutcome | null = null;
		if (appt.purchaseId) {
			outcome = await shiftPrivateAppointment(supabase, appt, strategy);
		} else if (appt.groupLessonId) {
			outcome = await shiftGroupAppointment(supabase, appt);
		}
		if (!outcome) continue;

		if (outcome.error) {
			result.warnings.push(`${describeAppointment(appt)}: ${outcome.error}`);
			continue;
		}
		if (outcome.conflict) {
			result.conflicts.push(outcome.conflict);
			continue;
		}
		if (outcome.shifted) {
			result.shiftedCount++;
			result.notifications.push(...outcome.notifications);
		}
	}

	return result;
}
