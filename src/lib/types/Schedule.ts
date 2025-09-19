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

// Types for trainee group relations to fix 'any' type errors
export interface TraineeGroupRelation {
	pe_trainees: { name: string };
	left_at: string | null;
}

// Time slot pattern for schedule
export interface TimeSlotPattern {
	day: DayOfWeek;
	hour: number;
}

// Package info with complete type definitions
export interface PackageInfo {
	id?: number;
	name?: string;
	reschedulable?: boolean;
	weeks_duration?: number | null;
	lessons_per_week?: number;
}

// Package group with complete type definitions
export interface PackageGroup {
	id: number;
	reschedule_left: number;
	start_date: string;
	end_date: string | null;
	successor_id: number | null;
	time_slots?: TimeSlotPattern[];
	pe_rooms?: { id: number; name: string } | null;
	pe_trainers?: { id: number; name: string } | null;
	pe_packages?: PackageInfo | null;
	pe_groups?: {
		id: number;
		type: string;
		pe_trainee_groups?: TraineeGroupRelation[];
	} | null;
}

// Types for appointments with relations (matches Supabase query with joins)
export type AppointmentWithRelations = Appointment & {
	pe_rooms?: { id?: number; name: string } | null;
	pe_trainers?: { id?: number; name: string } | null;
	pe_package_groups?: PackageGroup | null;
};

// Extended types with related data
export interface AppointmentWithDetails {
	// Core database fields - use the exact same types as the database
	id?: number;
	appointment_date?: string | null;
	created_by?: string | null;
	hour: number;
	notes?: string | null;
	package_group_id?: number | null; // Match database type exactly
	room_id?: number;
	series_id?: string | null;
	session_number?: number | null;
	total_sessions?: number | null;
	trainer_id?: number;
	updated_at?: string;
	status?: string | null; // Match database type

	// Extended fields for UI display
	room_name?: string;
	trainer_name?: string;
	trainee_names?: string[];
	trainee_count?: number;
	package_name?: string;
	reschedule_left?: number; // Number of reschedules remaining for this group
	package_start_date?: string;
	package_end_date?: string | null;
}

export interface WeeklyScheduleSlot {
	room_id: number;
	room_name: string;
	hour: number;
	is_available: boolean;
	appointment?: AppointmentWithDetails;
}

export interface ScheduleGrid {
	[roomId: number]: {
		room_name: string;
		slots: {
			[day: string]: {
				[hour: number]: WeeklyScheduleSlot;
			};
		};
	};
}

// Utility types for forms
export interface CreateAppointmentForm {
	room_id: number;
	trainer_id: number;
	package_id: number;
	appointment_date: string;
	hour: number;
	group_id: number;
	notes?: string;
}

// Type for existing appointment series used in group selection
export interface ExistingAppointmentSeries {
	package_group_id: number;
	package_id: number;
	group_id: number;
	room_name: string;
	trainer_name: string;
	current_capacity: number;
	max_capacity: number;
	day_time_combinations: {
		day: number;
		hours: number[];
	}[];
}

// Server-side query result types
export interface TraineeGroupData {
	pe_trainees: { id: number };
	left_at: string | null;
}

export interface AppointmentSeriesData {
	package_group_id: number;
	appointment_date: string;
	hour: number;
	pe_package_groups?: {
		pe_groups?: {
			id: number;
			pe_trainee_groups?: TraineeGroupData[];
		} | null;
		pe_packages?: { id: number; max_capacity: number } | null;
	} | null;
	pe_rooms?: { name: string } | null;
	pe_trainers?: { name: string } | null;
}

export interface ProcessedGroupData {
	package_group_id: number;
	package_id: number;
	group_id: number;
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
