import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Trainer, Room, Trainee, Package } from '$lib/types';

export const load: LayoutServerLoad = async ({ locals: { supabase, user } }) => {
	// Ensure user is authenticated
	if (!user) {
		throw error(401, 'Authentication required');
	}

	// Fetch essential data concurrently with proper error handling.
	// These run on every navigation — select only what the UI consumes.
	const queries = [
		{
			name: 'trainers',
			query: supabase
				.from('pe_trainers')
				.select('id, name, phone, is_active, organization_id, sort_order')
				.order('sort_order', { ascending: true })
		},
		{
			name: 'rooms',
			query: supabase
				.from('pe_rooms')
				.select('id, name, is_active, organization_id, sort_order')
				.order('sort_order', { ascending: true })
		},
		{
			name: 'trainees',
			query: supabase
				.from('pe_trainees')
				.select('id, name, phone, email, notes, is_active, created_at, auth_id, organization_id')
		},
		{
			name: 'packages',
			query: supabase.from('pe_packages').select('*').order('created_at', { ascending: false })
		}
	] as const;

	const results = await Promise.all(queries.map((q) => q.query));

	// A failed list degrades to empty rather than breaking every page
	const data: Record<string, (Trainer | Room | Trainee | Package)[]> = {};
	queries.forEach((query, index) => {
		const { data: queryData, error: queryError } = results[index];
		if (queryError) console.error(`Error loading ${query.name}:`, queryError);
		data[query.name] = queryData ?? [];
	});

	return {
		trainers: data.trainers as Trainer[],
		rooms: data.rooms as Room[],
		trainees: data.trainees as Trainee[],
		packages: data.packages as Package[]
	};
};
