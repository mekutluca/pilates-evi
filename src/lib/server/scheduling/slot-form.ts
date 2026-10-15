import type { WeeklySlot } from '$lib/types/Schedule';
import { DAYS_OF_WEEK } from '$lib/types/Schedule';

/** An hour of the day (0–23) from form text, or null. */
export function parseHour(value: string): number | null {
	// Digits only: Number('') is 0, which would read a missing hour as midnight
	if (!/^\d{1,2}$/.test(value)) return null;
	const hour = Number(value);
	return hour <= 23 ? hour : null;
}

/** One weekly slot from "monday-10", or null. */
export function parseWeeklySlot(raw: string): WeeklySlot | null {
	const [day, hourText = ''] = raw.split('-');
	const known = DAYS_OF_WEEK.find((d) => d === day);
	const hour = parseHour(hourText);
	return known && hour !== null ? { day: known, hour } : null;
}

/** Weekly slots from "monday-10,thursday-18"; null when any part is malformed. */
export function parseWeeklySlots(raw: string): WeeklySlot[] | null {
	const slots: WeeklySlot[] = [];
	for (const part of raw.split(',').filter(Boolean)) {
		const slot = parseWeeklySlot(part);
		if (!slot) return null;
		slots.push(slot);
	}
	return slots;
}
