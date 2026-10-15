// Imported by the pe-daily-reminder edge function as well: keep this file free of
// imports so it stays loadable from Deno.

/**
 * Formats a phone number to Turkish format (90XXXXXXXXXX)
 * @param phone - The phone number to format
 * @returns Formatted phone number string
 */
export function formatPhoneNumber(phone: string): string {
	const digits = phone.replace(/\D/g, '');

	if (digits.startsWith('90') && digits.length === 12) {
		return digits;
	}

	if (digits.length === 10 && digits.startsWith('5')) {
		return `90${digits}`;
	}

	// Trunk-prefixed national form: 05XXXXXXXXX
	if (digits.length === 11 && digits.startsWith('05')) {
		return `9${digits}`;
	}

	return digits;
}

/**
 * Normalizes a Turkish phone number as typed (spaces, dashes, +90, leading 0) to the
 * stored 10-digit national form, e.g. "0555 123 45 67" → "5551234567". Returns null when
 * the input isn't a 10-digit number after stripping those prefixes.
 */
export const PHONE_ERROR = 'Telefon numarası 10 haneli olmalı (ör. 555 123 45 67)';

export function normalizePhoneNumber(input: string): string | null {
	let digits = input.replace(/\D/g, '');
	if (digits.length === 12 && digits.startsWith('90')) digits = digits.slice(2);
	if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
	return /^\d{10}$/.test(digits) ? digits : null;
}

/** A stored 10-digit number for people to read: "555 123 45 67". */
export function formatPhoneDisplay(phone: string): string {
	const d = phone.replace(/\D/g, '');
	return d.length === 10
		? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`
		: phone;
}
