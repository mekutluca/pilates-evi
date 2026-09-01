/**
 * Type-narrowing replacement for `.filter(Boolean)` on nullable arrays:
 * `ids.filter(isNonNull)` yields `string[]` from `(string | null)[]`.
 */
export function isNonNull<T>(value: T): value is NonNullable<T> {
	return value !== null && value !== undefined;
}
