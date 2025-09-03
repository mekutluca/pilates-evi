import type { Tables } from '$lib/database.types';
import type { GroupWithMembers } from './Group';

// Basic database types
export type Package = Tables<'pe_packages'>;
export type PackageGroup = Tables<'pe_package_groups'>;

// Package with relations (matches Supabase query with joins)
export type PackageWithGroup = Tables<'pe_packages'> & {
	pe_package_groups?: Array<{
		pe_groups: GroupWithMembers;
	}>;
};

// Form types for simplified package creation
export interface CreatePackageForm {
	name: string;
	description?: string;
	weeks_duration: number;
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
}

export interface SelectedTimeSlot {
	day: string;
	hour: number;
}
