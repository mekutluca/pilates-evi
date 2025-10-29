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
 * Formats a date as YYYY-MM-DD for database storage using local time (not UTC)
 * This avoids timezone issues when converting dates
 * @param date - The date to format
 * @returns Formatted date string in YYYY-MM-DD format
 */
export function formatDateForDB(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
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

/**
 * Formats a date string for display in Turkish locale
 * @param dateString - The date string to format
 * @returns Formatted date string
 */
export function formatDisplayDate(dateString: string | null): string {
	if (!dateString) return '-';
	return new Date(dateString).toLocaleDateString('tr-TR', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
}

/**
 * Adds weeks to a date string and returns the result as YYYY-MM-DD
 * @param dateString - The date string in YYYY-MM-DD format
 * @param weeks - Number of weeks to add (can be negative)
 * @returns New date string in YYYY-MM-DD format
 */
export function addWeeksToDate(dateString: string, weeks: number): string {
	const date = new Date(dateString);
	date.setDate(date.getDate() + weeks * 7);
	return date.toISOString().split('T')[0];
}

/**
 * Calculates end date based on start date and duration in weeks
 * @param startDate - The start date string
 * @param weeksDuration - Duration in weeks
 * @returns Formatted end date string or 'Belirsiz' if no duration
 */
export function calculatePackageEndDate(
	startDate: string | null,
	weeksDuration: number | null
): string {
	if (!startDate || !weeksDuration) return 'Belirsiz';

	const endDateString = addWeeksToDate(startDate, weeksDuration);
	return formatDisplayDate(endDateString);
}

/**
 * Builds appointment slots based on a repeating time slot pattern
 * Used for both package extension and slot-based appointment shifting
 * @param timeSlots - Array of time slot patterns (day of week + hour)
 * @param startDate - The first appointment date
 * @param totalSlots - Total number of slots to generate
 * @returns Array of appointment slots with date and hour
 */
export function buildAppointmentSlots(
	timeSlots: Array<{ day: string; hour: number }>,
	startDate: Date,
	totalSlots: number
): Array<{ date: string; hour: number }> {
	const slots: Array<{ date: string; hour: number }> = [];

	// Find which slot in the pattern corresponds to the start date
	const startDayOfWeek = getDayOfWeekFromDate(startDate.toISOString().split('T')[0]);

	// Find the starting slot index in the pattern
	let startSlotIndex = timeSlots.findIndex((slot) => slot.day === startDayOfWeek);
	if (startSlotIndex === -1) startSlotIndex = 0;

	// Start from the week containing the start date
	const currentWeekStart = new Date(startDate);
	currentWeekStart.setDate(startDate.getDate() - startDate.getDay()); // Go to Sunday of this week

	let slotsGenerated = 0;
	let weekNum = 0;
	let slotIndexInPattern = startSlotIndex;

	while (slotsGenerated < totalSlots) {
		const slot = timeSlots[slotIndexInPattern];

		const dayMapping: Record<string, number> = {
			sunday: 0,
			monday: 1,
			tuesday: 2,
			wednesday: 3,
			thursday: 4,
			friday: 5,
			saturday: 6
		};
		const dayIndex = dayMapping[slot.day] ?? 0;

		const slotDate = new Date(currentWeekStart);
		slotDate.setDate(currentWeekStart.getDate() + weekNum * 7 + dayIndex);

		// Only include if this date is at or after the start date
		if (
			slotsGenerated > 0 ||
			slotDate.toISOString().split('T')[0] === startDate.toISOString().split('T')[0]
		) {
			const year = slotDate.getFullYear();
			const month = String(slotDate.getMonth() + 1).padStart(2, '0');
			const day = String(slotDate.getDate()).padStart(2, '0');
			const dateString = `${year}-${month}-${day}`;

			slots.push({
				date: dateString,
				hour: slot.hour
			});
			slotsGenerated++;
		}

		// Move to next slot in pattern
		slotIndexInPattern++;
		if (slotIndexInPattern >= timeSlots.length) {
			slotIndexInPattern = 0;
			weekNum++;
		}
	}

	return slots;
}
