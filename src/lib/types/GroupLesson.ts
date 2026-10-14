import type { SlotConflict } from './Conflict';
import type { SlotRef, WeeklySlot } from './Schedule';
import type { AssignmentPayload } from './Assignment';

// A group lesson (pe_group_lessons) as the Grup Dersleri pages show it
export interface GroupLessonSummary {
	id: string;
	packageId: string;
	packageName: string;
	roomId: string;
	roomName: string;
	trainerId: string;
	trainerName: string;
	startDate: string;
	endDate: string | null;
	slots: WeeklySlot[];
	maxCapacity: number;
	// Distinct trainees enrolled in a session from today on
	traineeCount: number;
	// Date of the lesson's last session that has trainees
	lastEnrolledDate: string | null;
	// Earliest date it can end on: the day after the last session with trainees, never
	// earlier than tomorrow
	minEndDate: string;
}

// A trainee attending a group lesson, with their kayıt in it
export interface GroupLessonMember {
	traineeId: string;
	name: string;
	purchaseId: string;
	upcomingCount: number;
	lastDate: string;
}

// One upcoming session of a group lesson
export interface GroupLessonSession {
	appointmentId: number;
	date: string;
	hour: number;
	roomId: string;
	roomName: string;
	trainerName: string;
	traineeNames: string[];
	// A one-off move that left the weekly pattern
	offPattern: boolean;
}

export interface GroupLessonDetail extends GroupLessonSummary {
	members: GroupLessonMember[];
	sessions: GroupLessonSession[];
}

// Opening a group lesson: weekly slots from the start date on
export interface NewGroupLessonInput {
	packageId: string;
	roomId: string;
	trainerId: string;
	startDate: string;
	slots: WeeklySlot[];
}

// A planned group lesson: the sessions it creates and the slots that are taken
export interface GroupLessonPlan {
	sessions: SlotRef[];
	conflicts: SlotConflict[];
	payload: AssignmentPayload;
}

// One weekly slot of a group lesson and where it moves to (same week)
export interface GroupSlotChange {
	from: WeeklySlot;
	to: WeeklySlot;
}

// Taşı for a whole group lesson from a date on: new weekly times and/or room/trainer
export interface GroupLessonMoveInput {
	groupLessonId: string;
	fromDate: string;
	slotChanges: GroupSlotChange[];
	roomId?: string;
	trainerId?: string;
}
