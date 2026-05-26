import type { ShiftNotificationEntry } from '$lib/types/WhatsApp';

// How the still-conflicting appointments should be resolved after the initial day cancellation.
// - 'shift'   : first pass — shift each appointment forward by one slot, skipping conflicts.
// - 'force'   : resolve pass — shift the given appointments forward by one slot despite conflicts.
// - 'closest' : resolve pass — shift each appointment to the closest free occurrence in its own
//               recurring day/hour pattern.
export type DayCancellationStrategy = 'shift' | 'force' | 'closest';

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

export interface DayCancellationResult {
	// Number of appointments whose series were shifted (and whose trainees were moved forward).
	shiftedCount: number;
	// Resolvable room/trainer conflicts that were skipped (private appointments only).
	conflicts: DayCancellationConflict[];
	// Trainee notifications to send for the appointments that were shifted in this pass.
	notifications: ShiftNotificationEntry[];
	// Non-resolvable issues encountered (e.g. a group trainee with no future slot to shift into).
	warnings: string[];
	// Fatal error that aborted the whole operation (e.g. an invalid/past day).
	error: string | null;
}
