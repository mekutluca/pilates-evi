import { error } from '@sveltejs/kit';
import { isValidUuid } from '$lib/utils/validation';

/**
 * Safely gets a string value from FormData
 * @param formData - The FormData object
 * @param key - The key to get
 * @returns The string value or empty string if not found/not a string
 */
export function getFormDataString(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === 'string' ? value : '';
}

/**
 * Gets a required string value from FormData. A missing one is a 400 whose message the
 * form's toast shows (forms mark these fields `required`, so it means a stale page).
 */
export function getRequiredFormDataString(formData: FormData, key: string): string {
	const value = formData.get(key);
	if (typeof value !== 'string' || !value.trim()) {
		console.error(`Missing required form field: ${key}`);
		throw error(400, 'Formda eksik bilgi var. Sayfayı yenileyip tekrar deneyin.');
	}
	return value;
}

/** A posted id, or null when the value can't name a row (missing or not a uuid). */
export function getFormDataUuid(formData: FormData, key: string): string | null {
	const value = getFormDataString(formData, key);
	return isValidUuid(value) ? value : null;
}
