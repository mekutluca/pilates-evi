import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { Role } from '$lib/types/Role';

export const load: LayoutServerLoad = async ({ locals: { session, supabase, user } }) => {
    if (!session) {
        throw redirect(302, '/login');
    }

    return {
        session,
        user,
        userRole: user?.role?.replace('pe_', '') as Role as Role
    };
};