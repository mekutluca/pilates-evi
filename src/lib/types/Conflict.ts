// Types for room/trainer booking conflict checks

export interface SlotRef {
	date: string; // YYYY-MM-DD
	hour: number;
}

export interface SlotConflict extends SlotRef {
	roomConflict: boolean;
	trainerConflict: boolean;
}

// An appointment about to move: its id and where it will be (room/trainer after the move)
export interface PlannedMove extends SlotRef {
	id: number;
	roomId: string;
	trainerId: string;
}

// Minimal appointment shape returned to clients previewing availability
export interface OccupiedSlot {
	id: number;
	room_id: string | null;
	trainer_id: string | null;
	date: string | null;
	hour: number | null;
}

// A group session that is already full
export interface CapacityIssue extends SlotRef {
	currentCapacity: number;
	maxCapacity: number;
}

// Result of validating planned enrollments against existing appointments
export interface EnrollmentTargetCheck {
	duplicates: Array<{ appointmentId: number; traineeId: string }>;
	overCapacity: Array<{ appointmentId: number; current: number; max: number }>;
}
