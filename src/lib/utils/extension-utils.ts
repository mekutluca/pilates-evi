import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { Purchase } from '$lib/types';

type SupabaseClientType = SupabaseClient<Database>;

/**
 * Follows the successor_id chain to find the last purchase
 * A purchase is "last" when it has no successor (successor_id is null)
 */
export async function findLastPurchaseInChain(
	supabase: SupabaseClientType,
	purchaseId: string
): Promise<Purchase | null> {
	let currentId = purchaseId;
	let currentPurchase: Purchase | null = null;
	const visitedIds = new Set<string>(); // Prevent infinite loops

	while (currentId && !visitedIds.has(currentId)) {
		visitedIds.add(currentId);

		const { data, error } = await supabase
			.from('pe_purchases')
			.select('*')
			.eq('id', currentId)
			.single();

		if (error || !data) {
			console.error('Error fetching purchase in chain:', error);
			return null;
		}

		currentPurchase = data;

		// If this purchase has a successor, continue following the chain
		if (data.successor_id) {
			currentId = data.successor_id;
		} else {
			// This is the last purchase in the chain
			break;
		}
	}

	return currentPurchase;
}

/**
 * Checks if a purchase can be extended
 * Rules:
 * - Must not already have a successor
 * - Must be a private or group package
 */
export async function canExtendPurchase(
	supabase: SupabaseClientType,
	purchaseId: string
): Promise<{ canExtend: boolean; reason?: string }> {
	// Get the purchase with package info
	const { data: purchase, error } = await supabase
		.from('pe_purchases')
		.select(
			`
			id,
			successor_id,
			pe_packages (
				package_type
			)
		`
		)
		.eq('id', purchaseId)
		.single();

	if (error || !purchase) {
		return { canExtend: false, reason: 'Satın alma bulunamadı' };
	}

	// Check if already has a successor
	if (purchase.successor_id) {
		return { canExtend: false, reason: 'Bu paket zaten uzatılmış' };
	}

	// Check package type
	const packageType = purchase.pe_packages?.package_type;
	if (packageType !== 'private' && packageType !== 'group') {
		return { canExtend: false, reason: 'Bu paket türü uzatılamaz' };
	}

	return { canExtend: true };
}

/**
 * Gets the last appointment date for a purchase
 * Works for both private lessons (purchase_id on appointment) and group lessons (purchase_id in pe_appointment_trainees)
 */
export async function getLastAppointmentDate(
	supabase: SupabaseClientType,
	purchaseId: string
): Promise<Date | null> {
	// First try direct purchase_id (for private lessons)
	const { data: directData } = await supabase
		.from('pe_appointments')
		.select('date')
		.eq('purchase_id', purchaseId)
		.order('date', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (directData && directData.date) {
		// Parse as local date to avoid timezone issues
		const [year, month, day] = directData.date.split('-').map(Number);
		return new Date(year, month - 1, day);
	}

	// Try via pe_appointment_trainees (for group lessons)
	const { data: traineeData } = await supabase
		.from('pe_appointment_trainees')
		.select('pe_appointments(date)')
		.eq('purchase_id', purchaseId)
		.order('pe_appointments(date)', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (traineeData && (traineeData as any).pe_appointments?.date) {
		const dateStr = (traineeData as any).pe_appointments.date;
		const [year, month, day] = dateStr.split('-').map(Number);
		return new Date(year, month - 1, day);
	}

	return null;
}

/**
 * Gets the last appointment date for a group lesson
 */
export async function getLastGroupLessonAppointmentDate(
	supabase: SupabaseClientType,
	groupLessonId: string
): Promise<Date | null> {
	const { data, error } = await supabase
		.from('pe_appointments')
		.select('date')
		.eq('group_lesson_id', groupLessonId)
		.order('date', { ascending: false })
		.limit(1)
		.single();

	if (error || !data || !data.date) {
		return null;
	}

	return new Date(data.date);
}

/**
 * Calculates the start date for an extension
 * - If last appointment is in the future: day after last appointment
 * - If all appointments are in the past: today (for finding the next week to start)
 *
 * Note: This is used as a reference date. The actual appointments will be created
 * based on the time slots, which will be on the next occurrence of those days.
 */
export function calculateExtensionStartDate(lastAppointmentDate: Date | null): Date {
	// Work with local dates to avoid timezone issues
	// Create date at midnight in local timezone, not UTC
	const now = new Date();
	const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	if (!lastAppointmentDate) {
		return todayLocal;
	}

	const lastDate = new Date(lastAppointmentDate);
	const lastDateLocal = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());

	// If last appointment is in the future, start the day after
	if (lastDateLocal >= todayLocal) {
		const startDate = new Date(lastDateLocal);
		startDate.setDate(startDate.getDate() + 1);
		return startDate;
	}

	// If all appointments are in the past, start from next Monday
	// This ensures we show a clean week view
	const nextMonday = new Date(todayLocal);
	const currentDay = todayLocal.getDay();
	const daysUntilMonday = currentDay === 0 ? 1 : currentDay === 1 ? 7 : 8 - currentDay;
	nextMonday.setDate(todayLocal.getDate() + daysUntilMonday);

	return nextMonday;
}
