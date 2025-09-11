// Constants
/**
 * Turkish day names indexed by JavaScript Date.getDay() (0=Sunday, 1=Monday, etc.)
 */
export const TURKISH_DAYS = [
	'Pazar',
	'Pazartesi', 
	'Salı',
	'Çarşamba',
	'Perşembe',
	'Cuma',
	'Cumartesi'
] as const;

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

/**
 * Formats a date as YYYY-MM-DD for URL parameters
 * @param date - The date to format
 * @returns Formatted date string in YYYY-MM-DD format
 */
export function formatDateParam(date: Date): string {
	return (
		date.getFullYear() +
		'-' +
		String(date.getMonth() + 1).padStart(2, '0') +
		'-' +
		String(date.getDate()).padStart(2, '0')
	);
}

/**
 * Gets the date for a specific day of the week within a given week
 * @param weekStart - The start date of the week (Monday)
 * @param dayOfWeek - The day of the week ('monday', 'tuesday', etc.)
 * @returns Date object for the specified day
 */
export function getDateForDayOfWeek(weekStart: Date, dayOfWeek: string): Date {
	const dayMapping = {
		monday: 0,
		tuesday: 1,
		wednesday: 2,
		thursday: 3,
		friday: 4,
		saturday: 5,
		sunday: 6
	};

	const targetDate = new Date(weekStart);
	const daysToAdd = dayMapping[dayOfWeek as keyof typeof dayMapping] || 0;
	targetDate.setDate(weekStart.getDate() + daysToAdd);
	return targetDate;
}

/**
 * Formats a date to show day and month (e.g., "15/08")
 * @param date - The date to format
 * @returns Formatted date string as DD/MM
 */
export function formatDayMonth(date: Date): string {
	return `${date.getDate()}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

/**
 * Gets the day of week from an appointment_date string
 * @param appointmentDate - The appointment date string (YYYY-MM-DD)
 * @returns Day of week as string (monday, tuesday, etc.)
 */
export function getDayOfWeekFromDate(appointmentDate: string): string {
	// Parse as UTC to avoid timezone issues with date strings
	const date = new Date(appointmentDate + 'T00:00:00.000Z');
	const dayIndex = date.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
	const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
	return days[dayIndex];
}
