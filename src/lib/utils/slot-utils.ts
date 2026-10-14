import { JS_DAY_TO_NAME, type DayOfWeek, type SlotRef, type WeeklySlot } from '$lib/types/Schedule';
import type { StartingAppointmentCandidate } from '$lib/types/Extension';
import type { SelectedGroupTimeslot } from '$lib/types';
import { formatDateForDB } from './date-utils';

// Monday-first ordering used for recurring weekly time-slot patterns.
export const DAY_ORDER: Record<DayOfWeek, number> = {
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
	sunday: 7
};

const SHORT_DAY_NAMES: Record<DayOfWeek, string> = {
	monday: 'Pzt',
	tuesday: 'Sal',
	wednesday: 'Çar',
	thursday: 'Per',
	friday: 'Cum',
	saturday: 'Cmt',
	sunday: 'Paz'
};

/**
 * A weekly pattern for people: "Sal, Per · 10:00" when every day shares the hour,
 * otherwise "Sal 10:00, Per 18:00".
 */
export function formatWeeklyPattern(slots: WeeklySlot[]): string {
	const sorted = sortTimeSlots(slots);
	const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;
	if (sorted.length > 0 && sorted.every((s) => s.hour === sorted[0].hour)) {
		return `${sorted.map((s) => SHORT_DAY_NAMES[s.day]).join(', ')} · ${hour(sorted[0].hour)}`;
	}
	return sorted.map((s) => `${SHORT_DAY_NAMES[s.day]} ${hour(s.hour)}`).join(', ');
}

/** A weekly slot as a key and in forms: "monday-10". */
export function weeklySlotKey(slot: { day: string; hour: number }): string {
	return `${slot.day}-${slot.hour}`;
}

/** A group lesson's weekly slot as a key and in forms: "<groupLessonId>|monday|10". */
export function groupSlotKey(slot: SelectedGroupTimeslot): string {
	return `${slot.group_lesson_id}|${slot.day}|${slot.hour}`;
}

/** Chronological order of concrete slots (date, then hour). */
export function compareSlots(a: SlotRef, b: SlotRef): number {
	return a.date.localeCompare(b.date) || a.hour - b.hour;
}

export function sortTimeSlots<T extends WeeklySlot>(slots: T[]): T[] {
	return [...slots].sort((a, b) => {
		const dayDiff = DAY_ORDER[a.day] - DAY_ORDER[b.day];
		if (dayDiff !== 0) return dayDiff;
		return a.hour - b.hour;
	});
}

/**
 * Whether (date, hour) is one of the pattern's recurring slots — the precondition of
 * buildAppointmentSlotsFromStart, for callers that would rather skip than throw.
 */
export function isSlotInPattern(timeSlots: WeeklySlot[], date: Date, hour: number): boolean {
	const dayName = JS_DAY_TO_NAME[date.getDay()];
	return timeSlots.some((s) => s.day === dayName && s.hour === hour);
}

function getMondayOf(date: Date): Date {
	const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const dayOfWeek = d.getDay();
	const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
	d.setDate(d.getDate() - daysFromMonday);
	return d;
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
	timeSlots: WeeklySlot[],
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
					date: formatDateForDB(slotDate),
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
	timeSlots: WeeklySlot[],
	totalSlots: number
): SlotRef[] {
	if (totalSlots <= 0 || timeSlots.length === 0) return [];

	const sortedSlots = sortTimeSlots(timeSlots);
	const startDayName = JS_DAY_TO_NAME[startDate.getDay()];
	const startIdx = sortedSlots.findIndex((s) => s.day === startDayName && s.hour === startHour);

	if (startIdx === -1) {
		throw new Error(
			`Başlangıç randevusu (${formatDateForDB(startDate)} ${startHour}:00) ders saatleri ile uyuşmuyor`
		);
	}

	const startMonday = getMondayOf(startDate);
	const slots: SlotRef[] = [];

	for (let i = 0; i < totalSlots; i++) {
		const idx = (startIdx + i) % sortedSlots.length;
		const weekOffset = Math.floor((startIdx + i) / sortedSlots.length);
		const slot = sortedSlots[idx];

		const slotDate = new Date(startMonday);
		slotDate.setDate(startMonday.getDate() + weekOffset * 7 + (DAY_ORDER[slot.day] - 1));

		slots.push({
			date: formatDateForDB(slotDate),
			hour: slot.hour
		});
	}

	return slots;
}
