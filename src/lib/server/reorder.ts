import { fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { ReorderableTable } from '$lib/types';

/**
 * New rows go to the end of the list: current max sort_order + 1.
 */
export async function nextSortOrder(
	supabase: SupabaseClient<Database>,
	table: ReorderableTable
): Promise<number> {
	const { data } = await supabase
		.from(table)
		.select('sort_order')
		.order('sort_order', { ascending: false })
		.limit(1)
		.maybeSingle();

	return (data?.sort_order ?? -1) + 1;
}

/**
 * Swaps a row with its neighbor in the given direction and renormalizes every
 * row's sort_order to its resulting index — this also fixes up any rows with
 * gapped or duplicate sort_order values along the way.
 */
export async function moveRow(
	supabase: SupabaseClient<Database>,
	table: ReorderableTable,
	request: Request
) {
	const formData = await request.formData();
	const id = formData.get('id');
	const direction = Number(formData.get('direction'));

	if (typeof id !== 'string' || !id || (direction !== 1 && direction !== -1)) {
		return fail(400, { success: false, message: 'Geçersiz istek' });
	}

	const { data, error } = await supabase
		.from(table)
		.select('id')
		.order('sort_order', { ascending: true })
		.order('id', { ascending: true });

	if (error || !data) {
		return fail(500, { success: false, message: 'Liste alınırken hata: ' + error?.message });
	}

	const ids = data.map((row) => row.id);
	const index = ids.indexOf(id);
	const target = index + direction;

	if (index === -1 || target < 0 || target >= ids.length) {
		return fail(400, { success: false, message: 'Geçersiz sıralama' });
	}

	[ids[index], ids[target]] = [ids[target], ids[index]];

	for (const [position, rowId] of ids.entries()) {
		const { error: updateError } = await supabase
			.from(table)
			.update({ sort_order: position })
			.eq('id', rowId);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Sıralama güncellenirken hata: ' + updateError.message
			});
		}
	}

	return { success: true };
}
