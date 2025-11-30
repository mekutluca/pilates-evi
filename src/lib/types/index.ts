// Centralized type exports for the Pilates Evi application
import type { Tables, TablesInsert, TablesUpdate } from '$lib/database.types';
import Users from '@lucide/svelte/icons/users';

// ===============================================
// BASIC DATABASE TYPES
// ===============================================

// Core entity types (direct from database)
export type Room = Tables<'pe_rooms'>;
export type Trainer = Tables<'pe_trainers'>;
export type Trainee = Tables<'pe_trainees'>;
export type Package = Tables<'pe_packages'>;
export type Purchase = Tables<'pe_purchases'>;
export type Team = Tables<'pe_teams'>;
export type Appointment = Tables<'pe_appointments'>;
export type AppointmentTrainee = Tables<'pe_appointment_trainees'>;

// Insert and update types
export type PurchaseInsert = TablesInsert<'pe_purchases'>;
export type PurchaseUpdate = TablesUpdate<'pe_purchases'>;
export type TeamInsert = TablesInsert<'pe_teams'>;
export type AppointmentInsert = TablesInsert<'pe_appointments'>;
export type AppointmentTraineeInsert = TablesInsert<'pe_appointment_trainees'>;

// ===============================================
// APPLICATION TYPES
// ===============================================

// User roles
export type Role = 'admin' | 'coordinator' | 'trainer' | 'trainee';

// User interface for auth
export interface User {
	id: string;
	email: string;
	fullName?: string;
	role: string;
	created_at: string;
	last_sign_in_at?: string;
}

// ===============================================
// UI COMPONENT TYPES
// ===============================================

// Form action results - compatible with SvelteKit result.data
export interface ActionResult {
	message?: string;
	success?: boolean;
}

// Unified interface for action items - flexible handler for both menu and table actions
export interface ActionItem {
	label: string;
	handler: (id?: number | string) => void | Promise<void>;
	class?: string;
	icon?: typeof Users;
}

// ===============================================
// PURCHASE TYPES (replaces old group system)
// ===============================================

// Helper type for purchase with trainees (via teams junction table)
export type PurchaseWithTrainees = Purchase & {
	pe_teams: Array<
		Team & {
			pe_trainees: Trainee | null;
		}
	>;
	pe_packages?: Package | null;
};

// Helper type for trainee purchases/memberships (via teams junction table)
export type TraineePurchase = Team & {
	pe_purchases:
		| (Purchase & {
				pe_packages: Package | null;
		  })
		| null;
};

// Type for trainee purchase memberships with extended fields for UI
export interface TraineePurchaseMembership {
	id: string;
	trainee_id: string | null;
	pe_purchases: {
		id: string;
		created_at: string;
		successor_id: string | null;
		reschedule_left: number | null;
		pe_packages: Package | null;
	} | null;
	// Extended UI fields
	package?: Package | null;
	joined_at: string;
	left_at?: string | null;
	purchase_id?: string;
	purchase_end_date?: string | null;
	purchase_start_date?: string | null;
	is_extension?: boolean;
	extension_number?: number;
	appointments?: Array<{
		id: string;
		date: string;
		hour: number;
	}>;
}

// ===============================================
// PACKAGE TYPES
// ===============================================

// Package with purchases (replaces old package with groups)
export type PackageWithPurchases = Package & {
	pe_purchases?: PurchaseWithTrainees[];
};

// Form types for simplified package creation
export interface CreatePackageForm {
	name: string;
	description?: string;
	weeks_duration: number | null;
	lessons_per_week: number;
	max_capacity: number;
	package_type: 'private' | 'group';
	reschedulable: boolean;
	reschedule_limit?: number;
}

// Package purchase types for the new assignment flow
export interface PackagePurchaseForm {
	package_id: string;
	room_id: string;
	trainer_id: string;
	start_date: string;
	time_slots: SelectedTimeSlot[];
	trainee_ids: string[];
	purchase_id?: string;
	group_lesson_id?: string;
	duration_weeks?: number; // For joining existing group lessons
	selected_group_timeslots?: SelectedGroupTimeslot[]; // For selecting specific timeslots from existing groups
}

export interface SelectedTimeSlot {
	day: string;
	hour: number;
	date?: string; // The actual date for this slot (YYYY-MM-DD format)
}

// Type for selecting a specific timeslot from an existing group lesson
export interface SelectedGroupTimeslot {
	group_lesson_id: string;
	day: string;
	hour: number;
}

// Type for existing group lessons returned from server
export interface ExistingGroupLesson {
	group_lesson_id: string;
	package_id: string;
	room_id: string;
	room_name: string;
	trainer_id: string;
	trainer_name: string;
	max_capacity: number;
	current_capacity: number;
	day_time_combinations: Array<{
		day: string;
		hours: number[];
	}>;
}

// Type for available timeslots from existing group lessons (with per-timeslot capacity)
export interface AvailableGroupTimeslot {
	group_lesson_id: string;
	room_id: string;
	room_name: string;
	trainer_id: string;
	trainer_name: string;
	day: string;
	hour: number;
	max_capacity: number;
	current_capacity: number; // Number of trainees currently assigned to this specific timeslot
}
