import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Trainer } from '$lib/types/Trainer';
import type { Room } from '$lib/types/Room.js';
import type { Trainee } from '$lib/types/Trainee.js';
import type { Package } from '$lib/types/Package.js';

export const load: LayoutServerLoad = async ({ locals: { supabase, user } }) => {
	// Ensure user is authenticated
	if (!user) {
		throw error(401, 'Authentication required');
	}

	// Fetch essential data concurrently with proper error handling
	const queries = [
		{ name: 'trainers', query: supabase.from('pe_trainers').select('*') },
		{ name: 'rooms', query: supabase.from('pe_rooms').select('*') },
		{ name: 'trainees', query: supabase.from('pe_trainees').select('*') },
		{ name: 'packages', query: supabase.from('pe_packages').select('*').order('created_at', { ascending: false }) }
	] as const;

	try {
		const results = await Promise.all(queries.map((q) => q.query));

		const data: Record<string, (Trainer | Room | Trainee | Package)[]> = {};

		queries.forEach((query, index) => {
			const { data: queryData, error: queryError } = results[index];

			if (queryError) {
				console.error(`Error loading ${query.name}:`, queryError);
				// For critical errors, you might want to throw instead of returning empty array
				data[query.name] = [];
			} else {
				data[query.name] = queryData || [];
			}
		});

		return {
			trainers: data.trainers as Trainer[],
			rooms: data.rooms as Room[],
			trainees: data.trainees as Trainee[],
			packages: data.packages as Package[]
		};
	} catch (err) {
		console.error('Failed to load application data:', err);
		// Return empty data instead of throwing to prevent app crash
		return {
			trainers: [],
			rooms: [],
			trainees: [],
			packages: []
		};
	}
};
