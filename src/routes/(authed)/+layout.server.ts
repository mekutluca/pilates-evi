import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals: { session, user, userRole } }) => {
	if (!session) {
		throw redirect(302, '/login');
	}

	return {
		session,
		user,
		userRole
	};
};
