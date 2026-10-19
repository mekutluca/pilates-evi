import type { Json } from '$lib/types/database.types';
import type { SupabaseClientType } from '$lib/types/Supabase';
import { DAYS_OF_WEEK, JS_DAY_TO_NAME, type DayOfWeek, type WeeklySlot } from '$lib/types/Schedule';
import type { GroupLessonTimeslot } from '$lib/types/Extension';
import { parseLocalDate } from '$lib/utils/date-utils';
import { recurringPattern, sortTimeSlots, weeklySlotKey } from '$lib/utils/slot-utils';
import { PurchaseRepository } from '$lib/server/repositories/purchase-repository';
import { dbErrorMessage } from '$lib/server/db-errors';

function isDayOfWeek(value: string): value is DayOfWeek {
	return (DAYS_OF_WEEK as readonly string[]).includes(value);
}

/** Reads pe_group_lessons.timeslots (jsonb), skipping malformed entries. */
export function parseGroupLessonTimeslots(raw: Json | null): GroupLessonTimeslot[] {
	if (!Array.isArray(raw)) return [];
	const result: GroupLessonTimeslot[] = [];
	for (const item of raw) {
		if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
		const day = item.day;
		const hours = item.hours;
		if (
			typeof day === 'string' &&
			Array.isArray(hours) &&
			hours.every((h): h is number => typeof h === 'number')
		) {
			result.push({ day, hours });
		}
	}
	return result;
}

/**
 * Returns every purchase id reachable from the given one by following
 * successor_id links, starting with the given id itself.
 * Delegates to PurchaseRepository (single recursive-CTE round-trip).
 */
export async function getPurchaseSuccessorChain(
	supabase: SupabaseClientType,
	purchaseId: string
): Promise<string[]> {
	return new PurchaseRepository(supabase).getSuccessorChain(purchaseId);
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
	const { data: directData, error: directError } = await supabase
		.from('pe_appointments')
		.select('date')
		.eq('purchase_id', purchaseId)
		.order('date', { ascending: false })
		.limit(1)
		.maybeSingle();

	// A failed read must not pass as "no lessons": renewals could then start before the last one
	if (directError)
		throw new Error(dbErrorMessage(directError, 'Kaydın dersleri yüklenemedi. Tekrar deneyin.'));
	if (directData && directData.date) {
		return parseLocalDate(directData.date);
	}

	// Try via pe_appointment_trainees (for group lessons)
	const { data: traineeData, error: traineeError } = await supabase
		.from('pe_appointment_trainees')
		.select('pe_appointments(date)')
		.eq('purchase_id', purchaseId)
		.order('pe_appointments(date)', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (traineeError)
		throw new Error(dbErrorMessage(traineeError, 'Kaydın dersleri yüklenemedi. Tekrar deneyin.'));
	const apt = traineeData?.pe_appointments;
	if (apt && !Array.isArray(apt) && apt.date) {
		return parseLocalDate(apt.date);
	}

	return null;
}

/**
 * Returns the canonical recurring time slots for a purchase, robust to one-off reschedules.
 *
 * - Group purchases: takes the union of `pe_group_lessons.timeslots` (the recurring schedule
 *   defined when the lesson was created) for every group lesson the trainee attends through
 *   this purchase, intersected with the slots the trainee actually attends. A reschedule that
 *   moves an appointment to an off-pattern (day, hour) is naturally excluded.
 * - Private purchases: the pattern the purchase's latest lessons follow (`recurringPattern`):
 *   one-off reschedules are left out, and after a Haftalık program change the new program
 *   wins, so Yenile starts from it.
 *
 * Also returns a `${dayIndex}-${hour}` → group_lesson_id map for group purchases, used by the
 * extension action to locate the existing appointment in the right group lesson when joining
 * a trainee to it.
 */
export async function getCanonicalPurchaseTimeSlots(
	supabase: SupabaseClientType,
	purchaseId: string,
	packageType: 'private' | 'group'
): Promise<{
	slots: WeeklySlot[];
	timeslotGroupLessons: Map<string, string>;
}> {
	if (packageType === 'group') {
		const { data: traineeApps } = await supabase
			.from('pe_appointment_trainees')
			.select('pe_appointments(group_lesson_id, date, hour)')
			.eq('purchase_id', purchaseId);

		if (!traineeApps || traineeApps.length === 0) {
			return { slots: [], timeslotGroupLessons: new Map() };
		}

		const groupLessonIds = new Set<string>();
		const traineeSlotsByGroup = new Map<string, Set<string>>(); // group_lesson_id → set of "dayName-hour"

		for (const t of traineeApps) {
			const apt = t.pe_appointments;
			if (!apt || Array.isArray(apt)) continue;
			if (!apt.group_lesson_id) continue;

			const dayName = JS_DAY_TO_NAME[parseLocalDate(apt.date).getDay()];
			const slotKey = `${dayName}-${apt.hour}`;

			groupLessonIds.add(apt.group_lesson_id);

			let set = traineeSlotsByGroup.get(apt.group_lesson_id);
			if (!set) {
				set = new Set<string>();
				traineeSlotsByGroup.set(apt.group_lesson_id, set);
			}
			set.add(slotKey);
		}

		if (groupLessonIds.size === 0) {
			return { slots: [], timeslotGroupLessons: new Map() };
		}

		const { data: groupLessons } = await supabase
			.from('pe_group_lessons')
			.select('id, timeslots')
			.in('id', Array.from(groupLessonIds));

		if (!groupLessons || groupLessons.length === 0) {
			return { slots: [], timeslotGroupLessons: new Map() };
		}

		const slots: WeeklySlot[] = [];
		const seen = new Set<string>();
		const timeslotGroupLessons = new Map<string, string>();

		for (const gl of groupLessons) {
			const groupTimeslots = parseGroupLessonTimeslots(gl.timeslots);
			const attended = traineeSlotsByGroup.get(gl.id) ?? new Set<string>();

			for (const ts of groupTimeslots) {
				if (!isDayOfWeek(ts.day)) continue;
				const day = ts.day;
				for (const hour of ts.hours) {
					const slotKey = `${day}-${hour}`;
					if (!attended.has(slotKey)) continue;
					if (!seen.has(slotKey)) {
						seen.add(slotKey);
						slots.push({ day, hour });
					}
					const dayIndex = JS_DAY_TO_NAME.indexOf(day);
					const numericKey = `${dayIndex}-${hour}`;
					if (!timeslotGroupLessons.has(numericKey)) {
						timeslotGroupLessons.set(numericKey, gl.id);
					}
				}
			}
		}

		return { slots, timeslotGroupLessons };
	}

	// Private purchase: the pattern its latest lessons follow (one-off moves left out)
	const { data: apts } = await supabase
		.from('pe_appointments')
		.select('date, hour')
		.eq('purchase_id', purchaseId);

	return { slots: recurringPattern(apts ?? []), timeslotGroupLessons: new Map() };
}

/**
 * A group lesson's weekly pattern from its timeslots JSON, chronological (Monday first),
 * each (day, hour) once.
 */
export function groupLessonSlots(raw: Json | null): WeeklySlot[] {
	const slots = new Map<string, WeeklySlot>();
	for (const ts of parseGroupLessonTimeslots(raw)) {
		if (!isDayOfWeek(ts.day)) continue;
		for (const hour of ts.hours)
			slots.set(weeklySlotKey({ day: ts.day, hour }), { day: ts.day, hour });
	}
	return sortTimeSlots([...slots.values()]);
}

/** The timeslots JSON for a weekly pattern: weekday order, hours ascending. */
export function toGroupLessonTimeslots(slots: WeeklySlot[]): GroupLessonTimeslot[] {
	return DAYS_OF_WEEK.map((day) => ({
		day,
		hours: slots
			.filter((s) => s.day === day)
			.map((s) => s.hour)
			.sort((a, b) => a - b)
	})).filter((ts) => ts.hours.length > 0);
}

/**
 * Returns the canonical recurring schedule for a group lesson, parsed straight from
 * `pe_group_lessons.timeslots`. Returns both an Array<{day,hour}> for iteration and a
 * Set keyed by `${dayName}-${hour}` for fast lookup.
 */
export async function getGroupLessonCanonicalSlots(
	supabase: SupabaseClientType,
	groupLessonId: string
): Promise<{
	slots: WeeklySlot[];
	slotKeys: Set<string>;
}> {
	const { data } = await supabase
		.from('pe_group_lessons')
		.select('timeslots')
		.eq('id', groupLessonId)
		.single();

	const slots = data ? groupLessonSlots(data.timeslots) : [];
	return { slots, slotKeys: new Set(slots.map(weeklySlotKey)) };
}

// calculateExtensionStartDate, getStartingAppointmentCandidates and
// buildAppointmentSlotsFromStart are pure helpers shared with client code;
// they live in $lib/utils/slot-utils.
