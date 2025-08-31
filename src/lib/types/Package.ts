import type { Tables } from '$lib/database.types';

// Basic database types
export type Package = Tables<'pe_packages'>;
export type PackageTrainee = Tables<'pe_package_trainees'>;

// Package with relations (matches Supabase query with joins)
export type PackageWithTrainees = Tables<'pe_packages'> & {
	pe_package_trainees?: Tables<'pe_package_trainees'>[];
};

// Form types for simplified package creation
export interface CreatePackageForm {
	name: string;
	description?: string;
	weeks_duration: number;
	lessons_per_week: number;
	max_capacity: number;
	trainee_type: 'fixed' | 'dynamic';
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
