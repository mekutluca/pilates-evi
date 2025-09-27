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
export type PurchaseTrainee = Tables<'pe_purchase_trainees'>;
export type Appointment = Tables<'pe_appointments'>;

// Insert and update types
export type PurchaseInsert = TablesInsert<'pe_purchases'>;
export type PurchaseUpdate = TablesUpdate<'pe_purchases'>;
export type PurchaseTraineeInsert = TablesInsert<'pe_purchase_trainees'>;
export type AppointmentInsert = TablesInsert<'pe_appointments'>;

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

// Helper type for purchase with trainees
export type PurchaseWithTrainees = Purchase & {
	pe_purchase_trainees: Array<{
		pe_trainees: Trainee;
	}>;
	pe_packages?: Package;
	pe_rooms?: Room;
	pe_trainers?: Trainer;
};

// Helper type for trainee purchases/memberships
export type TraineePurchase = PurchaseTrainee & {
	pe_purchases: Purchase & {
		pe_packages: Package;
		pe_rooms?: Room;
		pe_trainers?: Trainer;
	};
};

// Legacy compatibility type for trainee purchase memberships (adds compatibility fields)
export type TraineePurchaseMembership = Tables<'pe_purchase_trainees'> & {
	pe_purchases: Tables<'pe_purchases'> & {
		pe_packages: Tables<'pe_packages'>;
		pe_rooms?: Tables<'pe_rooms'>;
		pe_trainers?: Tables<'pe_trainers'>;
	};
	// Add frontend-expected fields for compatibility
	package?: Tables<'pe_packages'> | null;
	joined_at: string;
	left_at?: string | null;
	purchase_id?: number;
	purchase_end_date?: string | null;
	is_extension?: boolean;
	extension_number?: number;
	id: number | string;
};

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
	package_id: number;
	room_id: number;
	trainer_id: number;
	start_date: string;
	time_slots: SelectedTimeSlot[];
	trainee_ids: number[];
	purchase_id?: number; // Optional: for adding trainees to existing purchase
}

export interface SelectedTimeSlot {
	day: string;
	hour: number;
}

