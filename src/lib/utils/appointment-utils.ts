import type {
	AppointmentWithRelations,
	AppointmentWithDetails,
	AppointmentWarning
} from '$lib/types/Schedule';

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
		trainee_names: traineeNames,
		trainee_count: traineeNames.length,
		reschedule_left: purchase?.reschedule_left ?? 0,
		has_last_session: hasLastSession,
		appointment_trainees: appointmentTrainees
	};
}

function addToSlotMap(map: Map<string, number[]>, key: string, appointmentId: number): void {
	const existing = map.get(key);
	if (existing) {
		existing.push(appointmentId);
	} else {
		map.set(key, [appointmentId]);
	}
}

/**
 * Scans a set of appointments (e.g. a week of the schedule) and flags those that either exceed
 * their package capacity or share a (date, hour) slot with another appointment in the same room
 * or with the same trainer. Returns a map keyed by appointment id; only flagged appointments are
 * present. The whole set must be passed together so collisions can be detected across rooms and
 * trainers.
 */
export function computeAppointmentWarnings(
	appointments: AppointmentWithRelations[]
): Map<number, AppointmentWarning> {
	const roomSlots = new Map<string, number[]>();
	const trainerSlots = new Map<string, number[]>();

	for (const apt of appointments) {
		if (!apt.date || apt.hour === null) continue;
		if (apt.room_id) addToSlotMap(roomSlots, `${apt.room_id}|${apt.date}|${apt.hour}`, apt.id);
		if (apt.trainer_id) {
			addToSlotMap(trainerSlots, `${apt.trainer_id}|${apt.date}|${apt.hour}`, apt.id);
		}
	}

	const warnings = new Map<number, AppointmentWarning>();
	for (const apt of appointments) {
		if (!apt.date || apt.hour === null) continue;

		const maxCapacity =
			apt.pe_purchases?.pe_packages?.max_capacity ??
			apt.pe_group_lessons?.pe_packages?.max_capacity ??
			null;
		const traineeCount = apt.pe_appointment_trainees?.length ?? 0;
		const exceededCapacity = maxCapacity !== null && traineeCount > maxCapacity;

		const roomCollision =
			!!apt.room_id && (roomSlots.get(`${apt.room_id}|${apt.date}|${apt.hour}`)?.length ?? 0) > 1;
		const trainerCollision =
			!!apt.trainer_id &&
			(trainerSlots.get(`${apt.trainer_id}|${apt.date}|${apt.hour}`)?.length ?? 0) > 1;

		if (exceededCapacity || roomCollision || trainerCollision) {
			warnings.set(apt.id, { exceededCapacity, roomCollision, trainerCollision });
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
	const parts: string[] = [];
	if (warning.exceededCapacity) parts.push('Kapasite aşıldı');
	if (warning.roomCollision || warning.trainerCollision) parts.push('Çakışma');
	return parts.length > 0 ? parts.join(' · ') : undefined;
}
