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

// Types for purchase trainee relations to fix 'any' type errors
export interface PurchaseTraineeRelation {
	pe_trainees: { name: string };
	end_date: string | null;
}

// Time slot pattern for schedule (now stored as JSON in pe_purchases)
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

// Purchase with complete type definitions (replaces PackageGroup)
export interface Purchase {
	id: number;
	reschedule_left: number;
	start_date: string;
	end_date: string | null;
	successor_id: number | null;
	room_id: number | null;
	trainer_id: number | null;
	time_slots?: TimeSlotPattern[]; // JSON field containing TimeSlotPattern[]
	pe_rooms?: { id: number; name: string } | null;
	pe_trainers?: { id: number; name: string } | null;
	pe_packages?: PackageInfo | null;
	pe_purchase_trainees?: PurchaseTraineeRelation[];
}

// Types for appointments with relations (matches Supabase query with joins)
export type AppointmentWithRelations = Appointment & {
	purchase_id: number;
	pe_purchases?: Purchase | null;
	pe_rooms?: { id?: number; name: string } | null;
	pe_trainers?: { id?: number; name: string } | null;
};

// Extended types with related data
export interface AppointmentWithDetails {
	// Core database fields - use the exact same types as the database
	id?: number;
	appointment_date?: string | null;
	hour: number;
	notes?: string | null;
	purchase_id: number; // Updated to match new schema
	room_id?: number;
	series_id?: string | null;
	session_number?: number | null;
	total_sessions?: number | null;
	trainer_id?: number;
	status?: string | null; // Match database type

	// Extended fields for UI display
	room_name?: string;
	trainer_name?: string;
	trainee_names?: string[];
	trainee_count?: number;
	package_name?: string;
	reschedule_left?: number; // Number of reschedules remaining for this purchase
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


// Type for existing appointment series used in purchase selection
export interface ExistingPurchaseSeries {
	purchase_id: number;
	package_id: number;
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
export interface PurchaseTraineeData {
	pe_trainees: { id: number };
	end_date: string | null;
}

export interface AppointmentSeriesData {
	purchase_id: number;
	appointment_date: string;
	hour: number;
	pe_purchases?: {
		pe_packages?: { id: number; max_capacity: number } | null;
		pe_purchase_trainees?: PurchaseTraineeData[];
		pe_rooms?: { name: string } | null;
		pe_trainers?: { name: string } | null;
	} | null;
}

export interface ProcessedPurchaseData {
	purchase_id: number;
	package_id: number;
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
