import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { session, supabase }, depends }) => {
    if (!session) {
        throw redirect(302, '/login');
    }

    // Declare a dependency so the layout can be invalidated.
    // depends('sync:tasks');

    // const [tasksResponse, channelsResponse, repeatingTasksResponse] = await Promise.all([
    //     supabase.from('ss_tasks').select('*'),
    //     supabase.from('ss_channels').select('*'),
    //     supabase.from('ss_repeating_tasks').select('*'),
    // ]);

    // const tasks = tasksResponse.data ?? [];
    // const channels = channelsResponse.data ?? [];
    // const repeatingTasks = repeatingTasksResponse.data ?? [];

    // return {
    //     tasks: (tasks ?? []) as TaskType[],
    //     channels: (channels ?? []) as Channel[],
    //     repeatingTasks: (repeatingTasks ?? []) as RepeatingTaskType[]
    // };

    return {};
};