import type { DayOfWeek, SlotRef, WeeklySlot } from './Schedule';
import type { SlotConflict } from './Conflict';
import type { SelectedGroupTimeslot } from './index';

export interface StartingAppointmentCandidate {
	date: string; // YYYY-MM-DD
	hour: number;
	day: DayOfWeek;
}

// Shape of pe_group_lessons.timeslots JSON column
export type GroupLessonTimeslot = {
	day: string;
	hours: number[];
};

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

// The lessons a kayıt gets from a start date: a private weekly pattern with its room and
// trainer for N periods, or group time slots for N weeks
export type LessonPlanInput = { startDate: string } & (
	| { kind: 'private'; timeSlots: WeeklySlot[]; roomId: string; trainerId: string; periods: number }
	| { kind: 'group'; groupSlots: SelectedGroupTimeslot[]; weeks: number }
);

// Renewing (Yenile) the kayıt that contains `purchaseId`
export type RenewalInput = LessonPlanInput & { purchaseId: string };

// The planned lessons of a kayıt and anything that blocks them
export interface LessonPlan {
	sessions: SlotRef[];
	// Private: the new lessons of each period
	periods: SlotRef[][];
	// Group: the existing sessions joined
	groupSessionIds: number[];
	// Private: room/trainer taken at some of the new slots
	conflicts: SlotConflict[];
	// Group: sessions that are full / already include one of the trainees
	fullSessions: number;
	duplicateSessions: number;
}

// A planned renewal: the lessons, chained after the kayıt's latest purchase
export interface RenewalPlan extends LessonPlan {
	predecessorId: string;
	rescheduleLeft: number;
	chunks: ExtensionChunk[];
}
