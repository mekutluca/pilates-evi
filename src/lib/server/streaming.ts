/**
 * Wraps a streamed load promise: a failure is logged and resolves to null, which the page
 * shows as a load error with a retry (a rejected streamed promise would break the page).
 */
export function orNull<T>(promise: Promise<T>, what: string): Promise<T | null> {
	return promise.catch((loadError) => {
		console.error(`Error loading ${what}:`, loadError);
		return null;
	});
}
