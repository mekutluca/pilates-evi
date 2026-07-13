import type { Json } from '$lib/database.types';
import type { Purchase } from '$lib/types';
import type { SupabaseClientType } from '$lib/types/Supabase';
import { DAYS_OF_WEEK, JS_DAY_TO_NAME, type DayOfWeek } from '$lib/types/Schedule';
import type { UpcomingGroupAppointment, GroupLessonTimeslot } from '$lib/types/Extension';
import { parseLocalDate, formatDateForDB } from './date-utils';
import { PurchaseRepository } from '$lib/server/repositories/purchase-repository';

function isDayOfWeek(value: string): value is DayOfWeek {
	return (DAYS_OF_WEEK as readonly string[]).includes(value);
}

function parseGroupLessonTimeslots(raw: Json | null): GroupLessonTimeslot[] {
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
 * Follows the successor_id chain to find the last purchase
 * A purchase is "last" when it has no successor (successor_id is null)
 */
export async function findLastPurchaseInChain(
	supabase: SupabaseClientType,
	purchaseId: string
): Promise<Purchase | null> {
	return new PurchaseRepository(supabase).findLastInChain(purchaseId);
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
		return parseLocalDate(directData.date);
	}

	// Try via pe_appointment_trainees (for group lessons)
	const { data: traineeData } = await supabase
		.from('pe_appointment_trainees')
		.select('pe_appointments(date)')
		.eq('purchase_id', purchaseId)
		.order('pe_appointments(date)', { ascending: false })
		.limit(1)
		.maybeSingle();

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
 * - Private purchases: counts appointment occurrences by (day, hour) and filters out outliers
 *   (slots that appear far less often than the dominant ones — i.e. one-off reschedules).
 *
 * Also returns a `${dayIndex}-${hour}` → group_lesson_id map for group purchases, used by the
 * extension action to locate the existing appointment in the right group lesson when joining
 * a trainee to it.
 */
export async function getCanonicalPurchaseTimeSlots(
	supabase: SupabaseClientType,
	purchaseId: string,
	packageType: 'private' | 'group',
	weeksDuration: number
): Promise<{
	slots: Array<{ day: DayOfWeek; hour: number }>;
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
			if (!apt.group_lesson_id || !apt.date || apt.hour == null) continue;

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

		const slots: Array<{ day: DayOfWeek; hour: number }> = [];
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

	// Private purchase: filter outliers from appointment counts
	const { data: apts } = await supabase
		.from('pe_appointments')
		.select('date, hour')
		.eq('purchase_id', purchaseId);

	if (!apts || apts.length === 0) {
		return { slots: [], timeslotGroupLessons: new Map() };
	}

	const counts = new Map<string, { day: DayOfWeek; hour: number; count: number }>();

	for (const apt of apts) {
		if (!apt.date || apt.hour == null) continue;
		const day = JS_DAY_TO_NAME[parseLocalDate(apt.date).getDay()];
		const key = `${day}-${apt.hour}`;
		const existing = counts.get(key);
		if (existing) {
			existing.count++;
		} else {
			counts.set(key, { day, hour: apt.hour, count: 1 });
		}
	}

	const allSlots = Array.from(counts.values());
	if (allSlots.length === 0) {
		return { slots: [], timeslotGroupLessons: new Map() };
	}

	const maxCount = Math.max(...allSlots.map((s) => s.count));
	// A canonical slot must repeat: count ≥ 2 OR ≥ half the dominant count.
	// Falls back to slots tied for max if filtering would drop everything (e.g. 1-week purchase
	// with one reschedule — both old and new look like singletons).
	const threshold = Math.max(2, Math.ceil(weeksDuration / 2));
	const filtered = allSlots.filter((s) => s.count >= threshold);
	const chosen = filtered.length > 0 ? filtered : allSlots.filter((s) => s.count === maxCount);

	return {
		slots: chosen.map(({ day, hour }) => ({ day, hour })),
		timeslotGroupLessons: new Map()
	};
}

/**
 * For a group purchase, returns the actual upcoming appointment rows the trainee can join,
 * filtered to canonical (day, hour) per `pe_group_lessons.timeslots` so a one-off reschedule
 * destination at an off-pattern hour is excluded. Sorted chronologically.
 */
export async function getFutureGroupAppointments(
	supabase: SupabaseClientType,
	purchaseId: string,
	fromDate: Date,
	weeksDuration: number
): Promise<{
	canonicalSlots: Array<{ day: DayOfWeek; hour: number }>;
	upcomingAppointments: UpcomingGroupAppointment[];
}> {
	const { slots: canonicalSlots, timeslotGroupLessons } = await getCanonicalPurchaseTimeSlots(
		supabase,
		purchaseId,
		'group',
		weeksDuration
	);

	if (canonicalSlots.length === 0 || timeslotGroupLessons.size === 0) {
		return { canonicalSlots, upcomingAppointments: [] };
	}

	const groupLessonIds = Array.from(new Set(timeslotGroupLessons.values()));
	const fromYMD = formatDateForDB(fromDate);

	const { data: rows } = await supabase
		.from('pe_appointments')
		.select('id, date, hour, group_lesson_id')
		.in('group_lesson_id', groupLessonIds)
		.gte('date', fromYMD)
		.order('date', { ascending: true })
		.order('hour', { ascending: true });

	if (!rows || rows.length === 0) {
		return { canonicalSlots, upcomingAppointments: [] };
	}

	const upcoming: UpcomingGroupAppointment[] = [];

	for (const apt of rows) {
		if (!apt.date || apt.hour == null || !apt.group_lesson_id) continue;
		const dayIdx = parseLocalDate(apt.date).getDay();
		const expectedGroupLesson = timeslotGroupLessons.get(`${dayIdx}-${apt.hour}`);
		if (expectedGroupLesson !== apt.group_lesson_id) continue;

		upcoming.push({
			appointment_id: apt.id,
			date: apt.date,
			hour: apt.hour,
			day: JS_DAY_TO_NAME[dayIdx],
			group_lesson_id: apt.group_lesson_id
		});
	}

	return { canonicalSlots, upcomingAppointments: upcoming };
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
	slots: Array<{ day: DayOfWeek; hour: number }>;
	slotKeys: Set<string>;
}> {
	const { data } = await supabase
		.from('pe_group_lessons')
		.select('timeslots')
		.eq('id', groupLessonId)
		.single();

	if (!data) return { slots: [], slotKeys: new Set() };

	const slots: Array<{ day: DayOfWeek; hour: number }> = [];
	const slotKeys = new Set<string>();
	for (const ts of parseGroupLessonTimeslots(data.timeslots)) {
		if (!isDayOfWeek(ts.day)) continue;
		for (const hour of ts.hours) {
			const key = `${ts.day}-${hour}`;
			if (!slotKeys.has(key)) {
				slotKeys.add(key);
				slots.push({ day: ts.day, hour });
			}
		}
	}
	return { slots, slotKeys };
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

	return parseLocalDate(data.date);
}

// calculateExtensionStartDate, getStartingAppointmentCandidates and
// buildAppointmentSlotsFromStart are pure helpers shared with client code;
// they live in $lib/utils/slot-utils.
