import type { DbErrorLike } from '$lib/types/Supabase';
import { dbErrorMessage } from '$lib/server/db-errors';

// PostgREST returns at most 1000 rows per request
const ROW_PAGE = 1000;

/**
 * Every row of a query that can exceed one page; `fetchPage` must order by a unique column
 * so pages don't overlap. Throws with `failMessage` when a page fails.
 */
export async function pagedRows<T>(
	fetchPage: (
		from: number,
		to: number
	) => PromiseLike<{ data: T[] | null; error: DbErrorLike | null }>,
	failMessage = 'Kayıtlar yüklenemedi. Tekrar deneyin.'
): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += ROW_PAGE) {
		const { data, error } = await fetchPage(from, from + ROW_PAGE - 1);
		if (error) throw new Error(dbErrorMessage(error, failMessage));
		rows.push(...(data ?? []));
		if ((data ?? []).length < ROW_PAGE) return rows;
	}
}
