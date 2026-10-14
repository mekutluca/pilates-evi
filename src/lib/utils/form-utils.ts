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
 * Error message carried by a failed form action result
 * @param result - The action result
 * @returns The server's message or a default message
 */
export function getActionErrorMessage(result: { data?: { message?: string | null } }): string {
	return result.data?.message || 'Bir hata oluştu';
}
