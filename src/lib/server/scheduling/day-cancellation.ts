import type { SupabaseClientType } from '$lib/types/Supabase';
import type { SlotConflict } from '$lib/types/Conflict';
import type {
	DayAppointment,
	DayCancellationConflict,
	DayCancellationResult,
	CloseDayParams,
	DayCancellationStrategy,
	CloseDayPreview,
	CloseDayPreviewRow,
	ShiftOutcome
} from '$lib/types/Operation';
import {
	planTraineeSlotShift,
	shiftSeriesBySlot,
	shiftSeriesToFirstFreeSlot
} from '$lib/server/scheduling/shift';
import { NotificationService } from '$lib/server/services/notification-service';
import { deleteAppointment, shiftGroupTraineesOn } from '$lib/server/scheduling/cancellation';
import { formatShortTurkishDateTime, isAppointmentFuture } from '$lib/utils/date-utils';

// How far ahead the "closest free occurrence" search walks through the recurring pattern
// before giving up (≈ six months for a weekly slot).
const CLOSEST_PROBE_LIMIT = 26;

const DAY_APPOINTMENT_SELECT = `
	id, date, hour, purchase_id, group_lesson_id,
	pe_rooms(name),
	pe_trainers(name),
	pe_purchases(pe_packages(name)),
	pe_group_lessons(pe_packages(name)),
	pe_appointment_trainees(trainee_id, pe_trainees(name, phone))
` as const;

async function getDayAppointments(
	supabase: SupabaseClientType,
	date: string
): Promise<DayAppointment[]> {
	const { data } = await supabase
		.from('pe_appointments')
		.select(DAY_APPOINTMENT_SELECT)
		.eq('date', date)
		.order('hour', { ascending: true });

	return (data ?? []).map((row) => ({
		id: row.id,
		date: row.date,
		hour: row.hour,
		purchaseId: row.purchase_id,
		groupLessonId: row.group_lesson_id,
		roomName: row.pe_rooms.name ?? '',
		trainerName: row.pe_trainers.name ?? '',
		packageName: row.pe_purchases?.pe_packages.name ?? row.pe_group_lessons?.pe_packages.name ?? '',
		trainees: row.pe_appointment_trainees.map((t) => ({
			traineeId: t.trainee_id,
			name: t.pe_trainees.name,
			phone: t.pe_trainees.phone
		}))
	}));
}

function describeAppointment(appt: DayAppointment): string {
	const when = formatShortTurkishDateTime(appt.date, appt.hour);
	return appt.packageName ? `${when} ${appt.packageName}` : when;
}

function buildPrivateConflict(
	appt: DayAppointment,
	conflicts: SlotConflict[],
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

// Shifts a private (purchase-backed) appointment's whole series forward, mirroring a single
// appointment cancellation. The target slot is checked for room/trainer conflicts:
// - 'shift'   : shift by one slot; on a conflict nothing moves and it is reported to resolve.
// - 'closest' : walk forward through the recurring pattern to the first conflict-free occurrence.
async function shiftPrivateAppointment(
	supabase: SupabaseClientType,
	appt: DayAppointment,
	strategy: DayCancellationStrategy
): Promise<ShiftOutcome> {
	const result =
		strategy === 'closest'
			? await shiftSeriesToFirstFreeSlot(supabase, appt.id, CLOSEST_PROBE_LIMIT)
			: await shiftSeriesBySlot(supabase, appt.id, 1);

	if (result.error) return { shifted: false, notifications: [], error: result.error };
	if (result.conflicts.length > 0) {
		return {
			shifted: false,
			notifications: [],
			conflict: buildPrivateConflict(
				appt,
				result.conflicts,
				strategy === 'closest' ? 'Uygun boş randevu bulunamadı' : undefined
			)
		};
	}
	return { shifted: true, notifications: NotificationService.changesFromMoves(result.moved) };
}

// Group appointments move each trainee one slot on in their own pattern and remove the
// emptied slot, exactly like cancelling it alone. Targets are existing group appointments,
// so they never produce room/trainer conflicts; a trainee with no future slot is an error.
async function shiftGroupAppointment(
	supabase: SupabaseClientType,
	appt: DayAppointment
): Promise<ShiftOutcome> {
	const { error, changes } = await shiftGroupTraineesOn(supabase, appt.id);
	return error
		? { shifted: false, notifications: [], error }
		: { shifted: true, notifications: changes };
}

/**
 * Cancels a whole day: every future appointment on `date` that has trainees is shifted forward
 * using the same machinery as a single appointment cancellation, so no trainee session is lost.
 *
 * The initial pass (`strategy: 'shift'`) skips appointments whose target slot conflicts with
 * another room/trainer booking and returns them in `conflicts` for the user to resolve. A
 * follow-up call with `appointmentIds` restricted to those conflicts and `strategy: 'closest'`
 * (nearest free occurrence) resolves them. Empty slots are left
 * untouched.
 *
 * Schedule changes for the shifted appointments are returned (not sent) so the caller can
 * notify trainees with the user-supplied cause.
 */
export async function cancelDay(
	supabase: SupabaseClientType,
	params: CloseDayParams
): Promise<DayCancellationResult> {
	const strategy = params.strategy ?? 'shift';
	const idFilter = params.appointmentIds ? new Set(params.appointmentIds) : null;
	const appointments = await getDayAppointments(supabase, params.date);

	const result: DayCancellationResult = {
		shiftedCount: 0,
		deletedCount: 0,
		conflicts: [],
		notifications: [],
		warnings: [],
		error: null
	};

	for (const appt of appointments) {
		if (idFilter && !idFilter.has(appt.id)) continue;
		if (!isAppointmentFuture(appt.date, appt.hour)) continue;
		if (appt.trainees.length === 0) {
			// Empty slots (typically pre-created group lesson rows with no enrollments yet) on a
			// cancelled day have no trainees to shift; just remove the row.
			const { error: deleteError } = await deleteAppointment(supabase, appt.id);
			if (deleteError) {
				result.warnings.push(`${describeAppointment(appt)}: ${deleteError}`);
			} else {
				result.deletedCount++;
			}
			continue;
		}

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

/**
 * Dry run of closing `date`: what would happen to each upcoming appointment, computed with
 * the same planning as the real run (nothing is written).
 */
export async function previewCloseDay(
	supabase: SupabaseClientType,
	date: string
): Promise<CloseDayPreview> {
	const appointments = (await getDayAppointments(supabase, date)).filter((a) =>
		isAppointmentFuture(a.date, a.hour)
	);
	const phones = new Set<string>();
	const rows: CloseDayPreviewRow[] = [];

	for (const appt of appointments) {
		const base = {
			appointmentId: appt.id,
			hour: appt.hour,
			roomName: appt.roomName,
			trainerName: appt.trainerName,
			packageName: appt.packageName,
			traineeNames: appt.trainees.map((t) => t.name)
		};

		if (appt.trainees.length === 0) {
			rows.push({ ...base, outcome: 'remove_empty' });
			continue;
		}

		if (appt.purchaseId) {
			const result = await shiftSeriesBySlot(supabase, appt.id, 1, true);
			const own = result.moved.find((m) => m.appointment.id === appt.id);
			if (result.error) {
				rows.push({ ...base, outcome: 'error', note: result.error });
			} else if (result.conflicts.length > 0 || !own) {
				rows.push({
					...base,
					outcome: 'conflict',
					note: buildPrivateConflict(appt, result.conflicts).reason
				});
			} else {
				rows.push({ ...base, outcome: 'shift', newDate: own.newDate, newHour: own.newHour });
				appt.trainees.forEach((t) => phones.add(t.phone));
			}
			continue;
		}

		const targets: number[] = [];
		let planError: string | null = null;
		for (const trainee of appt.trainees) {
			const plan = await planTraineeSlotShift(supabase, appt.id, trainee.traineeId, 1);
			if (plan.error) {
				planError = plan.error;
				break;
			}
			const own = plan.shifted.find((r) => r.oldAppointmentId === appt.id);
			if (own) targets.push(own.newAppointmentId);
		}
		if (planError) {
			rows.push({ ...base, outcome: 'error', note: planError });
			continue;
		}
		const { data: next } = await supabase
			.from('pe_appointments')
			.select('date, hour')
			.in('id', targets)
			.order('date')
			.order('hour')
			.limit(1)
			.maybeSingle();
		rows.push({ ...base, outcome: 'shift', newDate: next?.date, newHour: next?.hour });
		appt.trainees.forEach((t) => phones.add(t.phone));
	}

	return { rows, recipientCount: phones.size };
}
