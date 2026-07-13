import { JS_DAY_TO_NAME, type DayOfWeek } from '$lib/types/Schedule';
import type { StartingAppointmentCandidate } from '$lib/types/Extension';
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

export function sortTimeSlots<T extends { day: DayOfWeek; hour: number }>(slots: T[]): T[] {
	return [...slots].sort((a, b) => {
		const dayDiff = DAY_ORDER[a.day] - DAY_ORDER[b.day];
		if (dayDiff !== 0) return dayDiff;
		return a.hour - b.hour;
	});
}

// Sunday-first ordering matching JS Date.getDay(). Required for patterns fed into
// buildAppointmentSlots, whose week walk starts on the Sunday of the start week.
export function sortTimeSlotsSundayFirst<T extends { day: DayOfWeek; hour: number }>(
	slots: T[]
): T[] {
	return [...slots].sort((a, b) => {
		const dayDiff = JS_DAY_TO_NAME.indexOf(a.day) - JS_DAY_TO_NAME.indexOf(b.day);
		if (dayDiff !== 0) return dayDiff;
		return a.hour - b.hour;
	});
}

export function getMondayOf(date: Date): Date {
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
	timeSlots: Array<{ day: DayOfWeek; hour: number }>,
	totalSlots: number
): Array<{ date: string; hour: number }> {
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
	const slots: Array<{ date: string; hour: number }> = [];

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
