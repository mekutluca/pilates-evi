import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Trainer } from '$lib/types/Trainer';

export const load: LayoutServerLoad = async ({ locals: { supabase, user } }) => {
    // Ensure user is authenticated
    if (!user) {
        throw error(401, 'Authentication required');
    }

    // Fetch trainers from pe_trainers table - available to all users
    const { data: trainers, error: trainersError } = await supabase
        .from('pe_trainers')
        .select('*');

    if (trainersError) {
        console.error('Error loading trainers:', trainersError);
        // Don't throw error, just return empty array to avoid breaking other pages
        return {
            trainers: [] as Trainer[]
        };
    }

    return {
        trainers: (trainers as Trainer[]) || []
    };
};