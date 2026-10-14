import type { Database } from '$lib/types/database.types';
import type { SlotConflict } from '$lib/types/Conflict';
import type { ScheduleChange } from '$lib/types/WhatsApp';

type PackageType = Database['public']['Enums']['package_type_enum'];

export type TransferScope = 'single' | 'from_selected' | 'all_from_now';

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

// Why a lesson moves. A client's own request spends a reschedule credit (single
// appointments, coordinators); the studio's reason travels in the WhatsApp message.
export type MoveReason = { source: 'trainee' } | { source: 'studio'; cause: string };

// What the Taşı panel changes: the time on the grid, room/trainer, N weeks, N lessons
export type MoveMode = 'time' | 'transfer' | 'weeks' | 'slots';

// Every way lessons can be moved (the Taşı panel)
export type MoveRequest =
	| {
			kind: 'transfer';
			appointmentId: number;
			scope: TransferScope;
			roomId?: string;
			trainerId?: string;
	  }
	| { kind: 'weeks'; appointmentId: number; scope: TransferScope; weeks: number }
	| { kind: 'slots'; appointmentId: number; slots: number }
	| { kind: 'trainee_weeks'; appointmentId: number; traineeId: string; weeks: number }
	| { kind: 'trainee_slots'; appointmentId: number; traineeId: string; slots: number };

// A lesson's slot with its room and trainer
export interface PlacedSlot {
	date: string;
	hour: number;
	roomId: string;
	trainerId: string;
}

// One lesson of a move, before and after
export interface MovePreviewRow {
	appointmentId: number;
	from: PlacedSlot;
	to: PlacedSlot;
}

// Result of previewing or applying a move: conflicts (nothing written), or the rows and
// the schedule changes to tell clients about
export interface MoveResult {
	error: string | null;
	conflicts: SlotConflict[];
	rows: MovePreviewRow[];
	changes: ScheduleChange[];
	// Weekly trainee shifts: target lessons that were cancelled and so skipped
	skippedCount: number;
}
