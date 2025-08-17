import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

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
 * Safely gets a required string value from FormData (backward compatible)
 * @param formData - The FormData object
 * @param key - The key to get
 * @returns The string value
 * @throws Error if the value is missing or not a string
 */
export function getRequiredFormDataString(formData: FormData, key: string): string {
	const value = formData.get(key);
	if (typeof value !== 'string' || !value.trim()) {
		throw new Error(`Missing required field: ${key}`);
	}
	return value;
}

/**
 * Safely gets a required string value from FormData with error handling
 * @param formData - The FormData object
 * @param key - The key to get
 * @returns Success object with value or failure object with error
 */
export function safeGetRequiredFormDataString(
	formData: FormData,
	key: string
): { success: true; value: string } | { success: false; error: string } {
	try {
		const value = formData.get(key);
		if (typeof value !== 'string' || !value.trim()) {
			return { success: false, error: `Missing required field: ${key}` };
		}
		return { success: true, value };
	} catch {
		return { success: false, error: `Invalid form data for field: ${key}` };
	}
}

/**
 * Safely gets an error message from action result data
 * @param result - The action result
 * @returns The error message or a default message
 */
export function getActionErrorMessage(result: { data?: { message?: unknown } }): string {
	return typeof result.data?.message === 'string' ? result.data.message : 'Bir hata oluştu';
}
