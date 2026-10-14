// Types for room/trainer booking conflict checks
import type { SlotRef } from '$lib/types/Schedule';

// A room/trainer pair over a date range (availability previews and API queries)
export interface SlotRange {
	roomId: string;
	trainerId: string;
	startDate: string;
	endDate: string;
}

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

// Minimal appointment shape returned to clients previewing availability
export interface OccupiedSlot {
	id: number;
	room_id: string;
	trainer_id: string;
	date: string;
	hour: number;
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
