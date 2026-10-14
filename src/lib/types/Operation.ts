import type { ScheduleChange } from '$lib/types/WhatsApp';

// How the still-conflicting appointments should be resolved after the initial day cancellation.
// - 'shift'   : first pass — shift each appointment forward by one slot, skipping conflicts.
// - 'closest' : resolve pass — shift each appointment to the closest free occurrence in its own
//               recurring day/hour pattern.
export type DayCancellationStrategy = 'shift' | 'closest';

// An appointment that could not be shifted because its target slot is occupied by another
// appointment (same room or trainer) outside its series. Surfaced so the user can choose how
// to resolve it (see DayCancellationStrategy).
export interface DayCancellationConflict {
	appointmentId: number;
	date: string;
	hour: number;
	roomName: string;
	trainerName: string;
	packageName: string;
	traineeNames: string[];
	reason: string; // human-readable, e.g. "Oda dolu", "Eğitmen dolu", "Oda ve eğitmen dolu"
}

// A trainee attached to an appointment on a day being cancelled.
export interface DayTrainee {
	traineeId: string;
	name: string;
	phone: string;
}

// A trainee of a closed group slot and the appointment they move into
export interface MovedTrainee {
	trainee: DayTrainee;
	newAppointmentId: number;
}

// An appointment on a day being cancelled, flattened for the cancellation flow.
export interface DayAppointment {
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

// Result of attempting to shift one appointment during a day cancellation.
export interface ShiftOutcome {
	shifted: boolean;
	notifications: ScheduleChange[];
	conflict?: DayCancellationConflict;
	error?: string;
}

// An active group lesson as listed on the end-group-lesson operation page.
export interface EndableGroupLesson {
	id: string;
	packageName: string;
	roomName: string;
	trainerName: string;
	startDate: string | null;
	timeslots: Array<{ day: string; hours: number[] }>;
	// Date of the lesson's last appointment that has enrolled trainees.
	lastEnrolledDate: string | null;
	// Distinct trainees enrolled in the lesson's appointments from today on.
	traineeCount: number;
	// Earliest selectable end date: the day after the last enrolled
	// appointment, but never earlier than tomorrow.
	minEndDate: string;
}

export interface DayCancellationResult {
	// Number of appointments whose series were shifted (and whose trainees were moved forward).
	shiftedCount: number;
	// Number of empty (no-trainee) slots removed from the cancelled day.
	deletedCount: number;
	// Resolvable room/trainer conflicts that were skipped (private appointments only).
	conflicts: DayCancellationConflict[];
	// Trainee notifications to send for the appointments that were shifted in this pass.
	notifications: ScheduleChange[];
	// Non-resolvable issues encountered (e.g. a group trainee with no future slot to shift into).
	warnings: string[];
	// Fatal error that aborted the whole operation (e.g. an invalid/past day).
	error: string | null;
}

// SchedulingService.closeDay; a resolution pass restricts it to the given appointments
export interface CloseDayParams {
	date: string;
	appointmentIds?: number[];
	strategy?: DayCancellationStrategy;
}
