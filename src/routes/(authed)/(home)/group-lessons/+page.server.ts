import type { PageServerLoad } from './$types';
import { listGroupLessons } from '$lib/server/scheduling/group-lessons';

export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const lessons = await listGroupLessons(supabase, { includeEnded: true });
	return {
		running: lessons.filter((l) => !l.endDate),
		ended: lessons
			.filter((l) => l.endDate)
			.sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''))
	};
};
