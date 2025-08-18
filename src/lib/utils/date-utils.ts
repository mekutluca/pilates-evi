/**
 * Gets the start of the week (Monday) for a given date
 * @param date - The date to get the week start for
 * @returns Date object representing the start of the week
 */
export function getWeekStart(date: Date): Date {
	const d = new Date(date);
	const day = d.getDay();
	const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
	d.setDate(diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

/**
 * Formats a week range in Turkish format
 * @param weekStart - The start date of the week
 * @returns Formatted week range string
 */
export function formatWeekRange(weekStart: Date): string {
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekStart.getDate() + 6);
	return `${weekStart.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} - ${weekEnd.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

/**
 * Gets the end of the week (Sunday) for a given date
 * @param date - The date to get the week end for
 * @returns Date object representing the end of the week
 */
export function getWeekEnd(date: Date): Date {
	const weekStart = getWeekStart(date);
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekStart.getDate() + 6);
	weekEnd.setHours(23, 59, 59, 999);
	return weekEnd;
}

/**
 * Checks if two dates are in the same week
 * @param date1 - First date
 * @param date2 - Second date
 * @returns True if dates are in the same week
 */
export function isSameWeek(date1: Date, date2: Date): boolean {
	const week1Start = getWeekStart(date1);
	const week2Start = getWeekStart(date2);
	return week1Start.getTime() === week2Start.getTime();
}
