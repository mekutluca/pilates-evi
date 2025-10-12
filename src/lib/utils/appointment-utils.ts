import type { AppointmentWithRelations, AppointmentWithDetails } from '$lib/types/Schedule';

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
