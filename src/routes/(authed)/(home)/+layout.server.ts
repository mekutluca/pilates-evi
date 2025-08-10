import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Trainer } from '$lib/types/Trainer';
import type { Room } from '$lib/types/Room.js';

export const load: LayoutServerLoad = async ({ locals: { supabase, user } }) => {
    // Ensure user is authenticated
    if (!user) {
        throw error(401, 'Authentication required');
    }

    // Fetch trainers and rooms concurrently
    const [
        { data: trainers, error: trainersError },
        { data: rooms, error: roomsError }
    ] = await Promise.all([
        supabase.from('pe_trainers').select('*'),
        supabase.from('pe_rooms').select('*')
    ]);

    if (trainersError) {
        console.error('Error loading trainers:', trainersError);
    }

    if (roomsError) {
        console.error('Error loading rooms:', roomsError);
    }

    return {
        trainers: trainersError ? ([] as Trainer[]) : ((trainers as Trainer[]) || []),
        rooms: roomsError ? ([] as Room[]) : ((rooms as Room[]) || [])
    };
};