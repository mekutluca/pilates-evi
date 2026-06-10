// Types for room/trainer booking conflict checks

export interface SlotRef {
	date: string; // YYYY-MM-DD
	hour: number;
}

export interface SlotConflict extends SlotRef {
	roomConflict: boolean;
	trainerConflict: boolean;
}

// Minimal appointment shape returned to clients previewing availability
export interface OccupiedSlot {
	id: number;
	room_id: string | null;
	trainer_id: string | null;
	date: string | null;
	hour: number | null;
}

// Result of validating planned enrollments against existing appointments
export interface EnrollmentTargetCheck {
	duplicates: Array<{ appointmentId: number; traineeId: string }>;
	overCapacity: Array<{ appointmentId: number; current: number; max: number }>;
}
