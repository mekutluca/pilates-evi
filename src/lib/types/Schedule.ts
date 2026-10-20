import type { Appointment } from './index';
import type { SeriesAppointment } from './Transfer';
import type { ScheduleChange } from './WhatsApp';

export type DayOfWeek =
	'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

// Decision applied to trainees attached to an appointment that is being cancelled
export type CancelTraineeAction = 'shift' | 'remove';

// A concrete slot: a date and the starting hour.
export interface SlotRef {
	date: string; // YYYY-MM-DD
	hour: number;
}

// One slot of a recurring weekly pattern (a weekday and the starting hour).
export interface WeeklySlot {
	day: DayOfWeek;
	hour: number;
}

// One slot of a weekly program and where it moves to (the same week's new day and hour)
export interface SlotChange {
	from: WeeklySlot;
	to: WeeklySlot;
}

// Slot changes checked against the program: each changed slot's new one by old slot key
// (weeklySlotKey), and the new program
export interface ResolvedSlotChanges {
	changes: Map<string, WeeklySlot>;
	slots: WeeklySlot[];
}

// Outcome of a write that either succeeds or fails with a message.
export type OperationResult = { error: string | null };

// A write that changed lesson times, with the changes to tell clients about
export type ChangeOutcome = OperationResult & { changes: ScheduleChange[] };

// One row of a pe_move_appointments call; omitted room/trainer stay unchanged. A type
// alias (not an interface) so it is assignable to the RPC's Json parameter.
export type AppointmentMove = {
	id: number;
	date: string;
	hour: number;
	room_id?: string;
	trainer_id?: string;
};

export interface ShiftedTraineeRecord {
	recordId: number;
	oldAppointmentId: number;
	newAppointmentId: number;
}

export interface TraineeShiftResult {
	error: string | null;
	shifted: ShiftedTraineeRecord[];
}

// A trainee's weekly shift: what moved (or, as a dry run, would move) and what was skipped
export interface TraineeWeeklyShiftResult extends TraineeShiftResult {
	skippedCount: number;
	// The trainee's appointments that move (dry runs can't name targets not created yet)
	movingAppointmentIds: number[];
}

// A trainee's enrollment flattened with its appointment slot, for shifting.
export interface SortedTraineeRecord {
	recordId: number;
	appointmentId: number;
	date: string;
	hour: number;
	groupLessonId: string | null;
}

// An appointment's id and slot.
export interface AppointmentSlotRef extends SlotRef {
	id: number;
}

// A trainee's enrollment slot in a group lesson (whose pattern it belongs to)
export interface TraineeGroupSlot extends SlotRef {
	groupLessonId: string | null;
}

// A trainee's appointment record queued for a weeks-based shift, with its group lesson
// resolved from the record's own appointment.
export interface WeeklyShiftCandidate {
	recordId: number;
	appointmentId: number;
	date: string;
	hour: number;
	groupLessonId: string;
}

// Outcome of resolving weekly-shift targets: successfully mapped records plus a count of
// candidates skipped because their target occurrence was cancelled and not recreated.
export interface WeeklyShiftResolution {
	shiftMap: ShiftedTraineeRecord[];
	skippedCount: number;
	// Group sessions created beyond the top-up horizon to receive the shift
	createdIds: number[];
	// Dry run: appointments whose target session would be created
	toCreateFromIds: number[];
}

// Group lesson fields needed to decide whether a missing target appointment slot should be
// auto-created (beyond the generation horizon) or left absent (a cancelled occurrence).
export interface GroupLessonHorizonInfo {
	room_id: string | null;
	trainer_id: string | null;
	organization_id: string;
	appointments_created_until: string | null;
	end_date: string | null;
}

// Types for appointment trainee relations
interface AppointmentTraineeRelation {
	id: number;
	session_number: number | null;
	total_sessions: number | null;
	purchase_id: string | null;
	pe_trainees: { id: string; name: string; notes: string | null } | null;
	pe_purchases: { successor_id: string | null } | null;
}

// Package info with complete type definitions
interface PackageInfo {
	id?: string;
	name?: string;
	package_type?: string;
	weeks_duration?: number | null;
	min_lessons_per_week?: number;
	max_lessons_per_week?: number;
	max_capacity?: number;
}

// Schedule-level issues flagged on an appointment: more trainees than the package allows, or
// another appointment occupying the same (date, hour) for the same room or trainer.
export interface AppointmentWarning {
	exceededCapacity: boolean;
}

// Purchase relation for appointments
interface PurchaseRelation {
	id: string;
	reschedule_left: number | null;
	successor_id?: string | null;
	pe_packages?: PackageInfo | null;
}

// Group lesson relation for appointments
interface GroupLessonRelation {
	id: string;
	pe_packages?: PackageInfo | null;
}

// Types for appointments with relations (matches Supabase query with joins)
export type AppointmentWithRelations = Appointment & {
	pe_purchases?: PurchaseRelation | null;
	pe_group_lessons?: GroupLessonRelation | null;
	pe_rooms?: { id: string; name: string | null } | null;
	pe_trainers?: { id: string; name: string | null } | null;
	pe_appointment_trainees?: AppointmentTraineeRelation[];
};

// Extended types with related data
export interface AppointmentWithDetails {
	// Core database fields - use the exact same types as the database
	id: number;
	date: string;
	hour: number;
	purchase_id: string | null;
	group_lesson_id: string | null;
	room_id: string;
	trainer_id: string;

	// Extended fields for UI display
	room_name?: string;
	trainer_name?: string;
	trainee_names?: string[];
	trainee_count?: number;
	package_name?: string;
	max_capacity?: number;
	reschedule_left?: number; // Number of reschedules remaining for this purchase
	has_last_session?: boolean; // Whether any trainee has their last session
	has_notes?: boolean; // Whether any trainee has notes (health, limits) the trainer should read
	appointment_trainees?: AppointmentTraineeRelation[]; // Trainee details
	session_number?: number | null;
	total_sessions?: number | null;
}

// The text lines of a lesson block on the week board
export interface LessonBlockLines {
	title: string;
	subtitle: string;
	meta: string;
}

// Constants
export const DAYS_OF_WEEK: DayOfWeek[] = [
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday',
	'sunday'
];

// Maps JS Date.getDay() (0 = Sunday) to day names.
export const JS_DAY_TO_NAME: DayOfWeek[] = [
	'sunday',
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday'
];

export const DAY_NAMES: Record<DayOfWeek, string> = {
	monday: 'Pazartesi',
	tuesday: 'Salı',
	wednesday: 'Çarşamba',
	thursday: 'Perşembe',
	friday: 'Cuma',
	saturday: 'Cumartesi',
	sunday: 'Pazar'
};

export const SCHEDULE_HOURS = Array.from({ length: 14 }, (_, i) => i + 9); // 9-22 (9 AM to 10 PM)

// Utility functions
export function getTimeString(hour: number): string {
	return `${hour.toString().padStart(2, '0')}:00`;
}

// ===============================================
// SCHEDULE SLOT TYPES (used by the Schedule component)
// ===============================================

// Slot tones: primary = booked (tinted), muted = quiet / taken / being moved,
// destructive = conflict
export type SlotColor = 'primary' | 'muted' | 'destructive';

interface BaseSlotData {
	day: DayOfWeek;
	hour: number;
	date: string; // ISO date string
}

interface EmptySlot extends BaseSlotData {
	variant: 'empty';
	label?: string; // Optional label like "-" or "Müsait"
}

interface AppointmentSlot extends BaseSlotData {
	variant: 'appointment';
	title: string; // Main text (the package)
	subtitle?: string; // Second line (trainees, or the group's fill)
	meta?: string; // Third line (the other dimension: trainer in a room view, room in a trainer view)
	badge?: string; // Optional badge text (e.g., "Son ders")
	warning?: string; // Optional conflict notation (e.g., "Kapasite aşıldı", "Çakışma")
	hasNotes?: boolean; // A trainee of the lesson has notes: marked on the block
	color?: SlotColor;
	clickable?: boolean;
	dimmed?: boolean; // Visually de-emphasize the slot (e.g., empty group lesson)
	data?: AppointmentWithDetails | Appointment;
}

interface AvailableSlot extends BaseSlotData {
	variant: 'available';
	label?: string; // Always shown (e.g. "Buraya taşı")
	hoverLabel?: string; // Shown only on hover/focus when there is no label (e.g. "Kayıt ekle")
	clickable?: boolean;
	// Picked (e.g. a weekly slot chosen in the wizard)
	selected?: boolean;
	color?: SlotColor;
}

export type ScheduleSlot = EmptySlot | AppointmentSlot | AvailableSlot;

// A time picked on the calendar grid as a move target
export interface PickedSlot extends SlotRef {
	roomId: string;
}

// A series loaded once for slot-shift planning: its appointments from the anchor on and
// the recurring weekly pattern they follow.
export interface SlotShiftContext {
	series: SeriesAppointment[];
	timeSlots: WeeklySlot[];
}

// Target appointments of a trainee move with the enrollments that stay in them (records
// moving out as part of the same shift are excluded).
export interface MoveTargets {
	targetRows: Array<{
		id: number;
		pe_group_lessons: { pe_packages: { max_capacity: number } } | null;
	}>;
	staying: Array<{ id: number; appointment_id: number | null; trainee_id: string }>;
}
