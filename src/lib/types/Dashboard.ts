import type { Package, Trainee } from './index';
import type { AppointmentWithDetails, SlotRef } from './Schedule';

// ===============================================
// DASHBOARD STATISTICS TYPES
// ===============================================

// Trainee data from database query
export interface TraineeFromQuery {
	id: string;
	name: string;
	phone: string;
	email: string | null;
	is_active: boolean;
}

// Purchase with related trainee and package information
export interface PurchaseWithDetails {
	id: string;
	created_at: string;
	trainee: TraineeFromQuery | null;
	package: Package | null;
}

// Trainee approaching their last lessons with session details
// A trainee whose current (not extended) purchase is about to run out
export interface TraineeWithLastLesson {
	trainee: Trainee;
	lesson_count: number;
	remaining_lessons: number;
	package: Package | null;
	// Date of their last upcoming lesson; null when none is left
	last_lesson_date: string | null;
}

// Overall dashboard statistics for the current week (admin/coordinator/trainee view)
export interface DashboardStats {
	kind: 'org';
	appointmentsCount: number;
	uniqueTraineesCount: number;
	purchasesThisWeek: PurchaseWithDetails[];
	traineesWithLastLessons: TraineeWithLastLesson[];
}

// Dashboard statistics scoped to a single trainer's own lessons this week
export interface TrainerDashboardStats {
	kind: 'trainer';
	weekAppointmentsCount: number;
	todayAppointmentsCount: number;
	uniqueTraineesCount: number;
	weeklyAppointments: AppointmentWithDetails[];
}

export type AnyDashboardStats = DashboardStats | TrainerDashboardStats;

// An upcoming enrollment row used to count a trainee's lessons left on a purchase
export interface UpcomingEnrollmentRow {
	trainee_id: string;
	purchase_id: string;
	pe_appointments: SlotRef;
}
