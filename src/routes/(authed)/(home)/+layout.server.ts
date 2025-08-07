import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Trainer } from '$lib/types/Trainer';
import type { Room } from '$lib/types/Room.js';

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
            trainers: [] as Trainer[],
            rooms: [] as Room[]
        };
    }

    // Fetch rooms from pe_rooms table - available to all users
    const { data: rooms, error: roomsError } = await supabase
        .from('pe_rooms')
        .select('*');

    if (roomsError) {
        console.error('Error loading rooms:', roomsError);
        return {
            trainers: (trainers as Trainer[]) || [],
            rooms: [] as Room[]
        };
    }

    return {
        trainers: (trainers as Trainer[]) || [],
        rooms: (rooms as Room[]) || []
    };
};