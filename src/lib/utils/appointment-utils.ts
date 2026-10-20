import type {
	AppointmentWithRelations,
	AppointmentWithDetails,
	AppointmentWarning,
	LessonBlockLines
} from '$lib/types/Schedule';
import { addDays, formatDateForDB } from '$lib/utils/date-utils';

/**
 * Converts an AppointmentWithRelations to AppointmentWithDetails
 * Extracts all necessary information from the nested relations
 */
export function createAppointmentDetails(
	appointment: AppointmentWithRelations,
	roomNameOverride?: string | null,
	trainerNameOverride?: string | null
): AppointmentWithDetails {
	const purchase = appointment.pe_purchases;
	const groupLesson = appointment.pe_group_lessons;
	const packageInfo = purchase?.pe_packages || groupLesson?.pe_packages;

	// Get trainee information from appointment_trainees
	const appointmentTrainees = appointment.pe_appointment_trainees || [];
	const traineeNames = appointmentTrainees.map((at) => at.pe_trainees?.name || '').filter(Boolean);

	// Check if any trainee has their last session AND their purchase has no successor
	// For private lessons: all trainees share one purchase, check appointment.pe_purchases.successor_id
	// For group lessons: each trainee has their own purchase, check trainee's pe_purchases.successor_id
	const hasLastSession = appointmentTrainees.some((at) => {
		const isLastSession = at.session_number === at.total_sessions && at.total_sessions !== null;
		if (!isLastSession) return false;

		// For private lessons, check the appointment's purchase
		if (purchase) {
			return !purchase.successor_id;
		}

		// For group lessons, check the trainee's purchase successor_id
		if (at.pe_purchases) {
			return !at.pe_purchases.successor_id;
		}

		// If we can't determine, assume it's the last session
		return true;
	});

	return {
		// Database fields - use values from appointment
		id: appointment.id,
		room_id: appointment.room_id,
		trainer_id: appointment.trainer_id,
		purchase_id: appointment.purchase_id,
		group_lesson_id: appointment.group_lesson_id,
		hour: appointment.hour,
		date: appointment.date,
		// Extended fields using relation data
		room_name: roomNameOverride || appointment.pe_rooms?.name || '',
		trainer_name: trainerNameOverride || appointment.pe_trainers?.name || '',
		package_name: packageInfo?.name || '',
		max_capacity: packageInfo?.max_capacity,
		trainee_names: traineeNames,
		trainee_count: traineeNames.length,
		reschedule_left: purchase?.reschedule_left ?? 0,
		has_last_session: hasLastSession,
		has_notes: appointmentTrainees.some((at) => !!at.pe_trainees?.notes),
		appointment_trainees: appointmentTrainees
	};
}

/**
 * Flags appointments of a set (e.g. a week of the schedule) that hold more trainees than
 * their package allows. Returns a map keyed by appointment id; only flagged appointments
 * are present. (Room and trainer double-bookings can't occur: unique indexes reject them.)
 */
export function computeAppointmentWarnings(
	appointments: AppointmentWithRelations[]
): Map<number, AppointmentWarning> {
	const warnings = new Map<number, AppointmentWarning>();
	for (const apt of appointments) {
		const maxCapacity =
			apt.pe_purchases?.pe_packages?.max_capacity ??
			apt.pe_group_lessons?.pe_packages?.max_capacity ??
			null;
		const traineeCount = apt.pe_appointment_trainees?.length ?? 0;
		if (maxCapacity !== null && traineeCount > maxCapacity) {
			warnings.set(apt.id, { exceededCapacity: true });
		}
	}
	return warnings;
}

/**
 * Builds the short notation shown on a schedule slot for a flagged appointment, or undefined when
 * there is nothing to flag.
 */
export function getAppointmentWarningLabel(
	warning: AppointmentWarning | undefined
): string | undefined {
	if (!warning) return undefined;
	return warning.exceededCapacity ? 'Kapasite aşıldı' : undefined;
}

/** A kayıt whose last lesson is at most this many days ahead is due a renewal (Yenile). */
const RENEWAL_WINDOW_DAYS = 14;

/** The last date (YYYY-MM-DD) a kayıt can end on and still be due a renewal. */
export function renewalWindowEnd(): string {
	return formatDateForDB(addDays(new Date(), RENEWAL_WINDOW_DAYS));
}

/** Whether a kayıt ending on `lastDate` (YYYY-MM-DD) is due a renewal. */
export function isRenewalDue(lastDate: string): boolean {
	return lastDate <= renewalWindowEnd();
}

/**
 * A lesson block on the week board: the package, who attends (a group shows its fill
 * first), and the other dimension of the view (the trainer on a room's week, the room on
 * a trainer's).
 */
export function lessonBlockLines(
	details: AppointmentWithDetails,
	other: 'room' | 'trainer'
): LessonBlockLines {
	const names = details.trainee_names ?? [];
	const who = names.length > 0 ? names.join(', ') : 'Öğrenci yok';
	return {
		title: details.package_name ?? '',
		subtitle:
			details.group_lesson_id && details.max_capacity
				? `${names.length}/${details.max_capacity} · ${who}`
				: who,
		meta: (other === 'room' ? details.room_name : details.trainer_name) ?? ''
	};
}
