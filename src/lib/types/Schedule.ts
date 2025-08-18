import type { Database } from '$lib/database.types';

export type DayOfWeek =
	| 'monday'
	| 'tuesday'
	| 'wednesday'
	| 'thursday'
	| 'friday'
	| 'saturday'
	| 'sunday';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';

// WeeklySchedule types removed - no longer using pe_weekly_schedules table

export type Appointment = Database['public']['Tables']['pe_appointments']['Row'];
export type AppointmentInsert = Database['public']['Tables']['pe_appointments']['Insert'];
export type AppointmentUpdate = Database['public']['Tables']['pe_appointments']['Update'];

export type AppointmentTrainee = Database['public']['Tables']['pe_appointment_trainees']['Row'];
export type AppointmentTraineeInsert =
	Database['public']['Tables']['pe_appointment_trainees']['Insert'];

export type RescheduleHistory = Database['public']['Tables']['pe_reschedule_history']['Row'];
export type RescheduleHistoryInsert =
	Database['public']['Tables']['pe_reschedule_history']['Insert'];

// Extended types with related data
export interface AppointmentWithDetails extends Omit<Appointment, 'status'> {
	room_name?: string;
	trainer_name?: string;
	training_name?: string;
	trainee_names?: string[];
	trainee_count?: number;
	status: string; // Make status required and string (not nullable)
}

export interface WeeklyScheduleSlot {
	room_id: number;
	room_name: string;
	day_of_week: DayOfWeek;
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
	day_of_week: DayOfWeek;
	hour: number;
	training_id?: number;
	trainee_ids: number[];
	notes?: string;
}

export interface RescheduleAppointmentForm {
	appointment_id: number;
	new_room_id: number;
	new_day_of_week: DayOfWeek;
	new_hour: number;
	reason?: string;
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

export function canCoordinatorReschedule(
	appointmentDay: DayOfWeek,
	appointmentHour: number,
	rescheduleCount: number
): {
	canReschedule: boolean;
	reason?: string;
} {
	// Check monthly limit
	if (rescheduleCount >= 2) {
		return {
			canReschedule: false,
			reason: 'Bu ay en fazla 2 randevu değiştirebilirsiniz'
		};
	}

	// Check 23-hour rule
	const now = new Date();
	const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
	const currentHour = now.getHours();

	// Convert DayOfWeek to number (Monday = 1, Sunday = 0)
	const appointmentDayNum =
		getDayIndex(appointmentDay) + 1 === 7 ? 0 : getDayIndex(appointmentDay) + 1;

	// Calculate hours until appointment
	let daysUntil = appointmentDayNum - currentDay;
	if (daysUntil < 0) daysUntil += 7; // Next week

	const hoursUntil = daysUntil * 24 + (appointmentHour - currentHour);

	if (hoursUntil < 23) {
		return {
			canReschedule: false,
			reason: 'Randevu değişikliği en az 23 saat önceden yapılmalıdır'
		};
	}

	return { canReschedule: true };
}
