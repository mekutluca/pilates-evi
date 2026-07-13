import type { Tables, TablesInsert, TablesUpdate } from '$lib/database.types';

export type DayOfWeek =
	| 'monday'
	| 'tuesday'
	| 'wednesday'
	| 'thursday'
	| 'friday'
	| 'saturday'
	| 'sunday';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';

// Decision applied to trainees attached to an appointment that is being cancelled
export type CancelTraineeAction = 'shift' | 'remove';

// Conflict reported by series-shift operations when a target slot is already occupied
// by an appointment outside the shifting series.
export interface ShiftConflict {
	date: string;
	hour: number;
	roomConflict: boolean;
	trainerConflict: boolean;
}

// Per-appointment record describing a series-shift outcome (for notifications/audit).
export interface ShiftedAppointment {
	id: number;
	oldDate: string;
	oldHour: number;
	newDate: string;
	newHour: number;
	roomId: string | null;
	trainerId: string | null;
	purchaseId: string | null;
	groupLessonId: string | null;
}

export interface SeriesShiftResult {
	error: string | null;
	conflicts: ShiftConflict[];
	shifted: ShiftedAppointment[];
}

export interface ShiftedTraineeRecord {
	recordId: number;
	oldAppointmentId: number;
	newAppointmentId: number;
}

export interface TraineeShiftResult {
	error: string | null;
	shifted: ShiftedTraineeRecord[];
}

// A fully-populated appointment row as required by series-shift operations.
export interface ShiftableAppointment {
	id: number;
	date: string;
	hour: number;
	room_id: string | null;
	trainer_id: string | null;
	purchase_id: string | null;
	group_lesson_id: string | null;
}

// Raw pe_appointments query row before null-completeness narrowing to ShiftableAppointment.
export interface RawAppointmentRow {
	id: number;
	date: string | null;
	hour: number | null;
	room_id: string | null;
	trainer_id: string | null;
	purchase_id: string | null;
	group_lesson_id: string | null;
}

// Raw pe_appointment_trainees query row (with joined appointment) for trainee shifts.
export interface TraineeRecordRow {
	id: number;
	appointment_id: number | null;
	purchase_id: string | null;
	pe_appointments: {
		id: number;
		date: string | null;
		hour: number | null;
		group_lesson_id: string | null;
	} | null;
}

// TraineeRecordRow narrowed and flattened, sorted chronologically for shifting.
export interface SortedTraineeRecord {
	recordId: number;
	appointmentId: number;
	date: string;
	hour: number;
	groupLessonId: string | null;
}

// Upcoming group appointment matching a trainee's own (day, hour) pattern.
export type EligibleAppointment = { id: number; date: string; hour: number };

// Core appointment type from database
export type Appointment = Tables<'pe_appointments'>;
export type AppointmentInsert = TablesInsert<'pe_appointments'>;
export type AppointmentUpdate = TablesUpdate<'pe_appointments'>;

// Types for appointment trainee relations
export interface AppointmentTraineeRelation {
	id: string;
	session_number: number | null;
	total_sessions: number | null;
	purchase_id: string | null;
	pe_trainees: { id: string; name: string } | null;
	pe_purchases: { successor_id: string | null } | null;
}

// Time slot pattern for schedule (now stored as JSON in pe_purchases)
export interface TimeSlotPattern {
	day: DayOfWeek;
	hour: number;
}

// Package info with complete type definitions
export interface PackageInfo {
	id?: string;
	name?: string;
	package_type?: string;
	reschedulable?: boolean;
	weeks_duration?: number | null;
	min_lessons_per_week?: number;
	max_lessons_per_week?: number;
	max_capacity?: number;
}

// Schedule-level issues flagged on an appointment: more trainees than the package allows, or
// another appointment occupying the same (date, hour) for the same room or trainer.
export interface AppointmentWarning {
	exceededCapacity: boolean;
	roomCollision: boolean;
	trainerCollision: boolean;
}

// Purchase relation for appointments
export interface PurchaseRelation {
	id: string;
	reschedule_left: number | null;
	successor_id?: string | null;
	pe_packages?: PackageInfo | null;
}

// Group lesson relation for appointments
export interface GroupLessonRelation {
	id: string;
	pe_packages?: PackageInfo | null;
}

// Types for appointments with relations (matches Supabase query with joins)
export type AppointmentWithRelations = Appointment & {
	pe_purchases?: PurchaseRelation | null;
	pe_group_lessons?: GroupLessonRelation | null;
	pe_rooms?: { id: string; name: string; capacity: number | null } | null;
	pe_trainers?: { id: string; name: string } | null;
	pe_appointment_trainees?: AppointmentTraineeRelation[];
};

// Extended types with related data
export interface AppointmentWithDetails {
	// Core database fields - use the exact same types as the database
	id: number; // Appointments still use number ID (not migrated to UUID yet)
	date: string | null; // Appointment date
	hour: number | null;
	purchase_id: string | null;
	group_lesson_id: string | null;
	room_id: string | null;
	trainer_id: string | null;

	// Extended fields for UI display
	room_name?: string;
	trainer_name?: string;
	trainee_names?: string[];
	trainee_count?: number;
	package_name?: string;
	reschedule_left?: number; // Number of reschedules remaining for this purchase
	has_last_session?: boolean; // Whether any trainee has their last session
	appointment_trainees?: AppointmentTraineeRelation[]; // Trainee details
	session_number?: number | null;
	total_sessions?: number | null;
}

export interface WeeklyScheduleSlot {
	room_id: string;
	room_name: string;
	hour: number;
	is_available: boolean;
	appointment?: AppointmentWithDetails;
}

export interface ScheduleGrid {
	[roomId: string]: {
		room_name: string;
		slots: {
			[day: string]: {
				[hour: number]: WeeklyScheduleSlot;
			};
		};
	};
}

// Type for existing appointment series used in purchase selection
export interface ExistingPurchaseSeries {
	purchase_id: string;
	package_id: string;
	room_name: string;
	trainer_name: string;
	current_capacity: number;
	max_capacity: number;
	day_time_combinations: {
		day: number;
		hours: number[];
	}[];
}

// Server-side query result types (now using appointment_trainees)
export interface AppointmentTraineeData {
	pe_trainees: { id: string; name: string } | null;
	session_number: number | null;
	total_sessions: number | null;
}

export interface AppointmentSeriesData {
	id: string;
	date: string;
	hour: number;
	room_id: string;
	trainer_id: string;
	purchase_id?: string | null;
	group_lesson_id?: string | null;
	pe_purchases?: {
		pe_packages?: { id: string; max_capacity: number } | null;
	} | null;
	pe_group_lessons?: {
		pe_packages?: { id: string; max_capacity: number } | null;
	} | null;
	pe_appointment_trainees?: AppointmentTraineeData[];
	pe_rooms?: { name: string } | null;
	pe_trainers?: { name: string } | null;
}

export interface ProcessedPurchaseData {
	purchase_id: string;
	package_id: string;
	room_name?: string;
	trainer_name?: string;
	current_capacity: number;
	max_capacity: number;
	day_time_slots: Map<number, Set<number>>;
}

// Types for package extension and conflict detection
export interface ExtensionRange {
	start: string;
	end: string;
}

export interface ConflictDetail {
	date: string;
	hour: number;
	day: DayOfWeek;
}

export interface ExtensionConflict {
	packageIndex: number;
	range: ExtensionRange;
	conflicts: ConflictDetail[];
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

export const STATUS_NAMES: Record<AppointmentStatus, string> = {
	scheduled: 'Planlandı',
	completed: 'Tamamlandı',
	cancelled: 'İptal Edildi'
};

// Utility functions
export function getTimeString(hour: number): string {
	return `${hour.toString().padStart(2, '0')}:00`;
}

export function getTimeRangeString(hour: number): string {
	return `${getTimeString(hour)} - ${getTimeString(hour + 1)}`;
}

export function getDayIndex(day: DayOfWeek): number {
	return DAYS_OF_WEEK.indexOf(day);
}

// ===============================================
// SCHEDULE SLOT TYPES (used by the Schedule component)
// ===============================================

export type SlotVariant = 'empty' | 'appointment' | 'available' | 'disabled' | 'custom';

export interface RescheduleSlotData {
	roomId: string;
	day: DayOfWeek;
	hour: number;
}

export interface BaseSlotData {
	day: DayOfWeek;
	hour: number;
	date: string; // ISO date string
}

export interface EmptySlot extends BaseSlotData {
	variant: 'empty';
	label?: string; // Optional label like "-" or "Müsait"
}

export interface AppointmentSlot extends BaseSlotData {
	variant: 'appointment';
	title: string; // Main text (e.g., trainer/room name)
	subtitle?: string; // Optional subtitle (e.g., package name)
	badge?: string; // Optional badge text (e.g., "Son ders")
	warning?: string; // Optional conflict notation (e.g., "Kapasite aşıldı", "Çakışma")
	color?: 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error';
	clickable?: boolean;
	dimmed?: boolean; // Visually de-emphasize the slot (e.g., empty group lesson)
	data?: AppointmentWithDetails | Appointment;
}

export interface AvailableSlot extends BaseSlotData {
	variant: 'available';
	label?: string; // Optional label like "Seç" or "Müsait"
	clickable?: boolean;
	disabled?: boolean;
	color?: 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error';
	data?: RescheduleSlotData;
}

export interface DisabledSlot extends BaseSlotData {
	variant: 'disabled';
	label?: string; // Optional label like "Geçmiş" or "23s"
	reason?: string; // Why it's disabled (for tooltip/accessibility)
}

export interface CustomSlot extends BaseSlotData {
	variant: 'custom';
	clickable?: boolean;
	data?: Record<string, never>;
}

export type ScheduleSlot = EmptySlot | AppointmentSlot | AvailableSlot | DisabledSlot | CustomSlot;
