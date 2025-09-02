import type { Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import type { GroupWithMembers } from './Group';

export type DayOfWeek =
	| 'monday'
	| 'tuesday'
	| 'wednesday'
	| 'thursday'
	| 'friday'
	| 'saturday'
	| 'sunday';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';

export type Appointment = Tables<'pe_appointments'>;
export type AppointmentInsert = TablesInsert<'pe_appointments'>;
export type AppointmentUpdate = TablesUpdate<'pe_appointments'>;

// Types for appointments with relations (matches Supabase query with joins)
export type AppointmentWithRelations = Appointment & {
	pe_rooms?: { id?: number; name: string } | null;
	pe_trainers?: { id?: number; name: string } | null;
	pe_packages?: { id?: number; name?: string; reschedulable?: boolean } | null;
	pe_groups?: {
		id: number;
		name: string;
		type: string;
		pe_trainee_groups: Array<{
			pe_trainees: { name: string };
			left_at: string | null;
		}>;
	} | null;
};

// Extended types with related data
export interface AppointmentWithDetails {
	// Core database fields (make key ones optional to allow partial data)
	id?: number;
	appointment_date?: string | null;
	created_at?: string;
	created_by?: string | null;
	hour: number; // Make hour required
	notes?: string | null;
	package_id: number; // Make package_id required (from database type)
	room_id?: number;
	series_id?: string | null;
	session_number?: number | null;
	total_sessions?: number | null;
	trainer_id?: number;
	updated_at?: string;
	status: string; // Make status required and string (not nullable)

	// Extended fields for UI display
	room_name?: string;
	trainer_name?: string;
	trainee_names?: string[];
	trainee_count?: number;
	package_name?: string;
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
