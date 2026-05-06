import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '$lib/database.types';
import type { Purchase } from '$lib/types';
import { DAYS_OF_WEEK, type DayOfWeek } from '$lib/types/Schedule';
import type {
	StartingAppointmentCandidate,
	UpcomingGroupAppointment,
	GroupLessonTimeslot
} from '$lib/types/Extension';
import { parseLocalDate } from './date-utils';

type SupabaseClientType = SupabaseClient<Database>;

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

const DAY_ORDER: Record<DayOfWeek, number> = {
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
	sunday: 7
};

const JS_DAY_TO_NAME: DayOfWeek[] = [
	'sunday',
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday'
];

function sortTimeSlots<T extends { day: DayOfWeek; hour: number }>(slots: T[]): T[] {
	return [...slots].sort((a, b) => {
		const dayDiff = DAY_ORDER[a.day] - DAY_ORDER[b.day];
		if (dayDiff !== 0) return dayDiff;
		return a.hour - b.hour;
	});
}

function getMondayOf(date: Date): Date {
	const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const dayOfWeek = d.getDay();
	const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
	d.setDate(d.getDate() - daysFromMonday);
	return d;
}

function formatLocalYMD(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

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
	const fromYMD = formatLocalYMD(fromDate);

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

/**
 * Calculates the earliest possible extension start date.
 * - If last appointment is in the future: day after last appointment.
 * - Otherwise: today.
 *
 * This is the lower bound for valid starting appointment candidates — the user picks
 * a specific (date, hour) candidate from the upcoming time-slot occurrences after this.
 */
export function calculateExtensionStartDate(lastAppointmentDate: Date | null): Date {
	const now = new Date();
	const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	if (!lastAppointmentDate) {
		return todayLocal;
	}

	const lastDate = new Date(lastAppointmentDate);
	const lastDateLocal = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());

	if (lastDateLocal >= todayLocal) {
		const startDate = new Date(lastDateLocal);
		startDate.setDate(startDate.getDate() + 1);
		return startDate;
	}

	return todayLocal;
}

/**
 * Returns the next `count` valid (date, hour) starting candidates from the time-slot pattern,
 * starting at `fromDate` (inclusive). Candidates are sorted chronologically.
 */
export function getStartingAppointmentCandidates(
	timeSlots: Array<{ day: DayOfWeek; hour: number }>,
	fromDate: Date,
	count: number
): StartingAppointmentCandidate[] {
	if (timeSlots.length === 0 || count <= 0) return [];

	const sortedSlots = sortTimeSlots(timeSlots);
	const fromLocal = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
	const startMonday = getMondayOf(fromLocal);

	const candidates: StartingAppointmentCandidate[] = [];
	let weekOffset = 0;

	while (candidates.length < count && weekOffset < 60) {
		for (const slot of sortedSlots) {
			const slotDate = new Date(startMonday);
			slotDate.setDate(startMonday.getDate() + weekOffset * 7 + (DAY_ORDER[slot.day] - 1));

			if (slotDate >= fromLocal) {
				candidates.push({
					date: formatLocalYMD(slotDate),
					hour: slot.hour,
					day: slot.day
				});
				if (candidates.length >= count) break;
			}
		}
		weekOffset++;
	}

	return candidates;
}

/**
 * Builds `totalSlots` consecutive appointment slots cycling through the time-slot pattern,
 * starting at the given (startDate, startHour) which must match one of the time slots
 * (by day-of-week and hour). The result preserves chronological order.
 */
export function buildAppointmentSlotsFromStart(
	startDate: Date,
	startHour: number,
	timeSlots: Array<{ day: DayOfWeek; hour: number }>,
	totalSlots: number
): Array<{ date: string; hour: number }> {
	if (totalSlots <= 0 || timeSlots.length === 0) return [];

	const sortedSlots = sortTimeSlots(timeSlots);
	const startDayName = JS_DAY_TO_NAME[startDate.getDay()];
	const startIdx = sortedSlots.findIndex((s) => s.day === startDayName && s.hour === startHour);

	if (startIdx === -1) {
		throw new Error(
			`Başlangıç randevusu (${formatLocalYMD(startDate)} ${startHour}:00) ders saatleri ile uyuşmuyor`
		);
	}

	const startMonday = getMondayOf(startDate);
	const slots: Array<{ date: string; hour: number }> = [];

	for (let i = 0; i < totalSlots; i++) {
		const idx = (startIdx + i) % sortedSlots.length;
		const weekOffset = Math.floor((startIdx + i) / sortedSlots.length);
		const slot = sortedSlots[idx];

		const slotDate = new Date(startMonday);
		slotDate.setDate(startMonday.getDate() + weekOffset * 7 + (DAY_ORDER[slot.day] - 1));

		slots.push({
			date: formatLocalYMD(slotDate),
			hour: slot.hour
		});
	}

	return slots;
}
