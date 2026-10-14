/**
 * Validation patterns and messages for form inputs
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD date string (form and URL values). */
export function isIsoDate(value: string): boolean {
	return ISO_DATE_PATTERN.test(value);
}

/** A whole-week shift of a series: non-zero, within a year either way. */
export function isValidWeekShift(weeks: number): boolean {
	return Number.isInteger(weeks) && weeks !== 0 && Math.abs(weeks) <= 52;
}

export const WEEK_SHIFT_ERROR = 'Kaydırma süresi -52 ile 52 hafta arasında olmalı';

export const validation = {
	email: {
		pattern: '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}',
		title: 'Geçerli bir e-posta adresi girin'
	},
	phone: {
		// 10 digits, spaces allowed ("555 123 45 67"); the server normalizes
		pattern: '\\s*[0-9](\\s*[0-9]){9}\\s*',
		maxlength: 16,
		title: '10 haneli telefon numarası girin (ör. 555 123 45 67)'
	}
} as const;
