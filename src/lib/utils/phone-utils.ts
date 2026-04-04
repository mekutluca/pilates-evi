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

	return digits;
}
