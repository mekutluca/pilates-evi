import type { DayOfWeek } from './Schedule';

export interface StartingAppointmentCandidate {
	date: string; // YYYY-MM-DD
	hour: number;
	day: DayOfWeek;
}

export interface UpcomingGroupAppointment {
	appointment_id: number;
	date: string;
	hour: number;
	day: DayOfWeek;
	group_lesson_id: string;
}

export interface AppointmentRefInfo {
	room_id: string;
	trainer_id: string;
	date: string;
	hour: number;
}

export interface PurchaseChainDates {
	start_date: Date | null;
	end_date: Date | null;
}

// Shape of pe_group_lessons.timeslots JSON column
export interface GroupLessonTimeslot {
	day: string;
	hours: number[];
}

// Inputs/outputs for the transactional pe_extend_purchase RPC
type ExtensionSlotChunk = {
	room_id: string;
	trainer_id: string;
	slots: Array<{ date: string; hour: number }>;
};

type ExtensionJoinChunk = {
	appointment_ids: number[];
};

export type ExtensionChunk = ExtensionSlotChunk | ExtensionJoinChunk;

export type ExtensionResult = {
	purchases_created: number;
	appointments_created: number;
	enrollments_created: number;
};
