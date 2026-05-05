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

export interface PurchaseChainEntry {
	id: string;
	successor_id: string | null;
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
