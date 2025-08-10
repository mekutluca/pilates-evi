import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Trainer } from '$lib/types/Trainer';
import type { Room } from '$lib/types/Room.js';
import type { Training } from '$lib/types/Training.js';
import type { Trainee } from '$lib/types/Trainee.js';

export const load: LayoutServerLoad = async ({ locals: { supabase, user } }) => {
    // Ensure user is authenticated
    if (!user) {
        throw error(401, 'Authentication required');
    }

    // Fetch all data concurrently
    const queries = [
        { name: 'trainers', query: supabase.from('pe_trainers').select('*') },
        { name: 'rooms', query: supabase.from('pe_rooms').select('*') },
        { name: 'trainings', query: supabase.from('pe_trainings').select('*') },
        { name: 'trainees', query: supabase.from('pe_trainees').select('*') },
        { name: 'trainerTrainings', query: supabase.from('pe_trainer_trainings').select('*') }
    ];

    const results = await Promise.all(queries.map(q => q.query));
    
    const data: any = {};
    
    queries.forEach((query, index) => {
        const { data: queryData, error } = results[index];
        
        if (error) {
            console.error(`Error loading ${query.name}:`, error);
            data[query.name] = [];
        } else {
            data[query.name] = queryData || [];
        }
    });

    return {
        trainers: data.trainers as Trainer[],
        rooms: data.rooms as Room[],
        trainings: data.trainings as Training[],
        trainees: data.trainees as Trainee[],
        trainerTrainings: data.trainerTrainings
    };
};