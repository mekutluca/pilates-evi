import type { Database } from '$lib/types/database.types';
import type { SlotConflict } from '$lib/types/Conflict';

type PackageType = Database['public']['Enums']['package_type_enum'];

export type TransferScope = 'single' | 'from_selected' | 'all_from_now';

export type TransferOperation = 'transfer' | 'shift';

export type ShiftMode = 'by_time' | 'by_slot';

export type TransferConflict = {
	appointmentId: number;
	date: string;
	hour: number;
	roomConflict: boolean;
	trainerConflict: boolean;
};

// An appointment with the relations scheduling operations need: room/trainer names for
// previews, package names and trainee phones for notifications. Shape of
// AppointmentRepository's SERIES_SELECT.
export type SeriesAppointment = {
	id: number;
	date: string;
	hour: number;
	room_id: string;
	trainer_id: string;
	purchase_id: string | null;
	group_lesson_id: string | null;
	organization_id: string;
	pe_rooms: { id: string; name: string | null };
	pe_trainers: { id: string; name: string | null };
	pe_purchases: {
		id: string;
		reschedule_left: number;
		pe_packages: { name: string; package_type: PackageType };
	} | null;
	pe_group_lessons: {
		id: string;
		pe_packages: { name: string; package_type: PackageType; max_capacity: number };
	} | null;
	pe_appointment_trainees: Array<{
		id: number;
		trainee_id: string;
		session_number: number;
		total_sessions: number;
		pe_trainees: { id: string; name: string; phone: string };
	}>;
};

// Room and/or trainer the moved appointments get (omitted = unchanged)
export interface MoveResources {
	roomId?: string;
	trainerId?: string;
}

// An appointment a scheduling operation moved, with where it went.
export type MovedAppointment = {
	appointment: SeriesAppointment;
	newDate: string;
	newHour: number;
};

// Result of a series move: conflicts (nothing written) or the moved appointments.
export type MoveOutcome = {
	error: string | null;
	conflicts: SlotConflict[];
	moved: MovedAppointment[];
};

// SchedulingService.reschedule: move one appointment, optionally spending a credit
export interface RescheduleParams {
	appointmentId: number;
	date: string;
	hour: number;
	roomId: string;
	consumeCredit: boolean;
}

// SchedulingService.transferResources: move appointments to another room and/or trainer
export interface TransferParams {
	appointmentId: number;
	scope: TransferScope;
	roomId?: string;
	trainerId?: string;
}

// SchedulingService.shiftSeriesByWeeks
export interface ShiftByWeeksParams {
	appointmentId: number;
	scope: TransferScope;
	weeks: number;
}
