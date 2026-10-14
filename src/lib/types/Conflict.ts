// Types for room/trainer booking conflict checks
import type { DayOfWeek, SlotRef } from '$lib/types/Schedule';

// Which of an appointment's resources are taken at a slot
export interface ResourceConflict {
	roomConflict: boolean;
	trainerConflict: boolean;
}

// Conflict check for creating appointments in a room with a trainer
export interface SlotConflictQuery {
	roomId: string;
	trainerId: string;
	slots: SlotRef[];
	excludeAppointmentIds?: number[];
}

// Conflict check for moving one existing appointment; null = resource not changing
export interface AppointmentSlotCheck extends SlotRef {
	roomId: string | null;
	trainerId: string | null;
	excludeAppointmentId?: number;
}

// Planned enrollments of trainees into existing appointments
export interface EnrollmentTargets {
	appointmentIds: number[];
	traineeIds: string[];
}

// A slot whose room and/or trainer is already taken
export interface SlotConflict extends SlotRef, ResourceConflict {}

// An appointment about to move: its id and where it will be (room/trainer after the move)
export interface PlannedMove extends SlotRef {
	id: number;
	roomId: string;
	trainerId: string;
}

// Result of validating planned enrollments against existing appointments
export interface EnrollmentTargetCheck {
	duplicates: Array<{ appointmentId: number; traineeId: string }>;
	overCapacity: Array<{ appointmentId: number; current: number; max: number }>;
}

// A weekly slot whose room or trainer is taken on `count` of the dates in a range
export interface BusyWeeklySlot {
	day: DayOfWeek;
	hour: number;
	count: number;
	// Taken on the range's first occurrence of the slot
	first: boolean;
}
