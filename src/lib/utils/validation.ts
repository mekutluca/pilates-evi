/**
 * Validation patterns and messages for form inputs
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}

export const validation = {
	email: {
		pattern: '[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}',
		title: 'Geçerli bir e-posta adresi girin'
	},
	phone: {
		pattern: '[0-9]{10}',
		maxlength: 10,
		title: '10 haneli telefon numarası girin (örn: 5551234567)'
	}
} as const;
