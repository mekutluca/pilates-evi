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
export type Group = Tables<'pe_groups'>;
export type PackageGroup = Tables<'pe_package_groups'>;

// Insert and update types
export type GroupInsert = TablesInsert<'pe_groups'>;
export type GroupUpdate = TablesUpdate<'pe_groups'>;
export type PackageGroupInsert = TablesInsert<'pe_package_groups'>;
export type TraineeGroupInsert = TablesInsert<'pe_trainee_groups'>;

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
// GROUP TYPES
// ===============================================

export type TraineeGroup = Tables<'pe_trainee_groups'>;
export type TraineeGroupUpdate = TablesUpdate<'pe_trainee_groups'>;
export type GroupType = 'individual' | 'fixed' | 'dynamic';

// Helper type for trainee group relationships
export type TraineeGroupWithTrainee = TraineeGroup & {
	pe_trainees: {
		id: number;
		name: string;
		email?: string;
	};
};

// Extended types with relationships
export type GroupWithMembers = Group & {
	pe_trainee_groups?: TraineeGroupWithTrainee[];
	active_member_count?: number;
};

// Helper type for group creation
export type GroupCreationData = {
	type: GroupType;
	trainee_ids: number[];
};

// ===============================================
// PACKAGE TYPES
// ===============================================

// Package with relations (matches Supabase query with joins)
export type PackageWithGroup = Package & {
	pe_package_groups?: Array<{
		pe_groups: GroupWithMembers;
	}>;
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

// Package assignment types for the new assignment flow
export interface PackageAssignmentForm {
	package_id: number;
	room_id: number;
	trainer_id: number;
	start_date: string;
	time_slots: SelectedTimeSlot[];
	trainee_ids: number[];
	group_id?: number; // Optional - used when adding to existing group
}

export interface SelectedTimeSlot {
	day: string;
	hour: number;
}

// Time slot pattern stored in pe_package_groups.time_slots
export interface TimeSlotPattern {
	day: string;
	hour: number;
	room_id: number;
	trainer_id: number;
}
