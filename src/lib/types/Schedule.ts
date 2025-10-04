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

// Core appointment type from database
export type Appointment = Tables<'pe_appointments'>;
export type AppointmentInsert = TablesInsert<'pe_appointments'>;
export type AppointmentUpdate = TablesUpdate<'pe_appointments'>;

// Types for appointment trainee relations
export interface AppointmentTraineeRelation {
	id: string;
	session_number: number | null;
	total_sessions: number | null;
	pe_trainees: { id: string; name: string } | null;
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
	lessons_per_week?: number;
}

// Purchase relation for appointments
export interface PurchaseRelation {
	id: string;
	reschedule_left: number | null;
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
