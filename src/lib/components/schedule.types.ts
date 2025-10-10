import type { DayOfWeek, AppointmentWithDetails } from '$lib/types/Schedule';
import type { Appointment } from '$lib/types';

// Slot variant types
export type SlotVariant = 'empty' | 'appointment' | 'available' | 'disabled' | 'custom';

// Data types for different slot variants
export interface RescheduleSlotData {
	roomId: string;
	day: DayOfWeek;
	hour: number;
}

// Base slot data that all slots have
export interface BaseSlotData {
	day: DayOfWeek;
	hour: number;
	date: string; // ISO date string
}

// Different slot types
export interface EmptySlot extends BaseSlotData {
	variant: 'empty';
	label?: string; // Optional label like "-" or "Müsait"
}

export interface AppointmentSlot extends BaseSlotData {
	variant: 'appointment';
	title: string; // Main text (e.g., trainer/room name)
	subtitle?: string; // Optional subtitle (e.g., package name)
	badge?: string; // Optional badge text (e.g., "Son ders")
	color?: 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error';
	clickable?: boolean;
	data?: AppointmentWithDetails | Appointment; // Full appointment details or basic appointment
}

export interface AvailableSlot extends BaseSlotData {
	variant: 'available';
	label?: string; // Optional label like "Seç" or "Müsait"
	clickable?: boolean;
	disabled?: boolean; // For slots that are available but can't be selected
	data?: RescheduleSlotData; // Data for reschedule slot selection
}

export interface DisabledSlot extends BaseSlotData {
	variant: 'disabled';
	label?: string; // Optional label like "Geçmiş" or "23s"
	reason?: string; // Why it's disabled (for tooltip/accessibility)
}

export interface CustomSlot extends BaseSlotData {
	variant: 'custom';
	clickable?: boolean;
	data?: Record<string, never>; // Empty object type - custom slots shouldn't have predefined data
}

export type ScheduleSlot = EmptySlot | AppointmentSlot | AvailableSlot | DisabledSlot | CustomSlot;
