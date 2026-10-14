import type { Database } from '$lib/types/database.types';
import type { ShiftConflict } from '$lib/types/Schedule';

type PackageType = Database['public']['Enums']['package_type_enum'];

export type TransferScope = 'single' | 'from_selected' | 'all_from_now';

export type TransferOperation = 'transfer' | 'shift';

export type ShiftMode = 'by_time' | 'by_slot';

export type TransferConflict = {
	appointmentId: number;
	date: string | null;
	hour: number | null;
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

// An appointment a scheduling operation moved, with where it went.
export type MovedAppointment = {
	appointment: SeriesAppointment;
	newDate: string;
	newHour: number;
};

// Result of a series move: conflicts (nothing written) or the moved appointments.
export type MoveOutcome = {
	error: string | null;
	conflicts: ShiftConflict[];
	moved: MovedAppointment[];
};

export type ExistingAppointment = {
	date: string;
	hour: number;
	room_id: string;
	trainer_id: string;
	id: number;
};
