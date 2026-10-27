// Attendance (Yoklama) and what follows a missed lesson
import type { AbsenceOutcome, SlotRef } from '$lib/types/Schedule';
import type { ScheduleChange } from '$lib/types/WhatsApp';

// Where a shifted lesson would go: the kayıt's next pattern slot after its last lesson. A
// private kayıt gets a new appointment there; a group member joins that session.
export interface ShiftPlan extends SlotRef {
	kind: 'private' | 'group';
	roomId: string;
	trainerId: string;
	roomName: string;
	trainerName: string;
	// The group session to join (group kayıtlar only)
	appointmentId: number | null;
}

// A group session a make-up can go into: same package, in the future, with a free seat
export interface MakeupCandidate extends SlotRef {
	appointmentId: number;
	roomName: string;
	trainerName: string;
	taken: number;
	capacity: number;
}

// A decided absence: the replacement lesson (none when burned) and whom to tell
export interface AbsenceResolution {
	error: string | null;
	outcome: AbsenceOutcome;
	replacement: SlotRef | null;
	changes: ScheduleChange[];
}

// The missed lesson a decision is about, with what placing its replacement needs
export interface MissedLesson {
	traineeId: string;
	phone: string;
	purchaseId: string;
	packageId: string;
	packageName: string;
	capacity: number;
	isGroup: boolean;
	appointment: SlotRef & { room_id: string; trainer_id: string; group_lesson_id: string | null };
}

// A trainee's attendance on one kayıt, as the client hub shows it
export interface KayitAttendance {
	attended: number;
	absent: number;
	// Missed lessons still awaiting a decision
	pending: number;
}
