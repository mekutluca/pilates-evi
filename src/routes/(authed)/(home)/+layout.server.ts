import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Trainer } from '$lib/types/Trainer';
import type { Room } from '$lib/types/Room.js';
import type { Training } from '$lib/types/Training.js';

export const load: LayoutServerLoad = async ({ locals: { supabase, user } }) => {
    // Ensure user is authenticated
    if (!user) {
        throw error(401, 'Authentication required');
    }

    // Fetch trainers, rooms, and trainings concurrently
    const [
        { data: trainers, error: trainersError },
        { data: rooms, error: roomsError },
        { data: trainings, error: trainingsError }
    ] = await Promise.all([
        supabase.from('pe_trainers').select('*'),
        supabase.from('pe_rooms').select('*'),
        supabase.from('pe_trainings').select('*')
    ]);

    if (trainersError) {
        console.error('Error loading trainers:', trainersError);
    }

    if (roomsError) {
        console.error('Error loading rooms:', roomsError);
    }

    if (trainingsError) {
        console.error('Error loading trainings:', trainingsError);
    }

    return {
        trainers: trainersError ? ([] as Trainer[]) : ((trainers as Trainer[]) || []),
        rooms: roomsError ? ([] as Room[]) : ((rooms as Room[]) || []),
        trainings: trainingsError ? ([] as Training[]) : ((trainings as Training[]) || [])
    };
};