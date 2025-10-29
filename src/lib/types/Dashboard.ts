import type { Package, Trainee } from './index';

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
export interface TraineeWithLastLesson {
	trainee: Trainee;
	session_number: number;
	total_sessions: number;
	package: Package | null;
	appointment_date: string;
}

// Overall dashboard statistics for the current week
export interface DashboardStats {
	appointmentsCount: number;
	uniqueTraineesCount: number;
	purchasesThisWeek: PurchaseWithDetails[];
	traineesWithLastLessons: TraineeWithLastLesson[];
}
