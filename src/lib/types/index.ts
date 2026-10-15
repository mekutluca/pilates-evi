// Centralized type exports for the Pilates Evi application
import type { Tables } from '$lib/types/database.types';
import type { WeeklySlot } from '$lib/types/Schedule';
import Users from '@lucide/svelte/icons/users';

// ===============================================
// BASIC DATABASE TYPES
// ===============================================

// Core entity types (direct from database)
// capacity is unused (being dropped from the table)
export type Room = Tables<'pe_rooms'>;
export type Trainer = Tables<'pe_trainers'>;
export type Trainee = Tables<'pe_trainees'>;
export type Package = Tables<'pe_packages'>;
export type Purchase = Tables<'pe_purchases'>;
type Team = Tables<'pe_teams'>;
export type Appointment = Tables<'pe_appointments'>;

// Trainer accounts' emails live in auth.users, not pe_trainers, so they're
// merged in at load time rather than being part of the base row type.
export type TrainerWithEmail = Trainer & { email: string | null };

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

// Unified interface for action items - flexible handler for both menu and table actions
export interface ActionItem {
	label: string;
	handler: (id?: number | string) => void | Promise<void>;
	class?: string;
	icon?: typeof Users;
}

// Context contract for the global action drawer (see $lib/stores/action-drawer.svelte.ts)
export interface ActionDrawerContext {
	openDrawer: (actions: ActionItem[]) => void;
}

// Column config for sortable-table.svelte
export interface Column<T> {
	key: string;
	title: string;
	sortable?: boolean;
	render?: (item: T, index?: number) => string;
	renderComponent?: import('svelte').Component<{ item: T; index: number }>;
	class?: string;
}

// Svelte context contract consumed by reorder-cell.svelte (see $lib/components/reorder-cell.svelte)
export interface ReorderContext {
	// SvelteKit form action to submit moves to, e.g. '?/moveRoom'
	action: string;
	total: () => number;
	busy: () => boolean;
	setBusy: (value: boolean) => void;
}

// Tables with a manually-managed sort_order column (see $lib/server/reorder.ts)
export type ReorderableTable = 'pe_rooms' | 'pe_trainers';

// ===============================================
// PURCHASE TYPES (replaces old group system)
// ===============================================

// Helper type for purchase with trainees (via teams junction table)
type PurchaseWithTrainees = Purchase & {
	pe_teams: Array<
		Team & {
			pe_trainees: Trainee | null;
		}
	>;
	pe_packages?: Package | null;
};

// One lesson of a trainee's kayıt, as listed on the trainee page
export interface KayitLesson {
	appointmentId: number;
	date: string;
	hour: number;
	roomId: string;
	roomName: string;
	trainerName: string;
}

// A trainee's kayıt: a purchase and its renewals (the successor chain), shown as one card
export interface TraineeKayit {
	// First purchase of the chain
	id: string;
	// Latest purchase: renewals extend it, its credits apply now
	currentPurchaseId: string;
	purchaseIds: string[];
	packageName: string;
	isGroup: boolean;
	// Lessons sold across the chain
	lessonCount: number;
	creditsLeft: number;
	lessons: KayitLesson[];
	upcoming: KayitLesson[];
	// The weekly pattern of its upcoming (or, once over, all) lessons
	slots: WeeklySlot[];
	roomName: string;
	trainerName: string;
	// Other trainees sharing the private lessons
	sharedTrainees: SharedTrainee[];
}

// A teammate attached to the same private purchase appointments as the trainee being viewed.
export interface SharedTrainee {
	id: string;
	name: string;
}

// Who loses the upcoming private-lesson appointments when a purchase's remaining lessons are
// deleted: only the viewed trainee, or every trainee attached to those appointments.
export type RemainingLessonsScope = 'trainee' | 'all';

// A trainee's upcoming appointment link under a purchase, queued for deletion.
export interface RemainingLessonRecord {
	recordId: number;
	appointmentId: number;
	isGroup: boolean;
}

export interface DeleteRemainingLessonsResult {
	deletedCount: number;
	error: string | null;
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
	min_lessons_per_week: number;
	max_lessons_per_week: number;
	max_capacity: number;
	package_type: 'private' | 'group';
	reschedulable: boolean;
	reschedule_limit?: number;
}

// A trainee as pickers list them
export type TraineeOption = Pick<Trainee, 'id' | 'name' | 'phone'>;

export type TraineeInput = {
	name: string;
	phone: string;
	email: string | null;
	notes: string | null;
};

// Type for selecting a specific timeslot from an existing group lesson
export interface SelectedGroupTimeslot {
	group_lesson_id: string;
	day: string;
	hour: number;
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
