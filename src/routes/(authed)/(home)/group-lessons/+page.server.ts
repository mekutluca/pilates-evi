import type { PageServerLoad } from './$types';
import { orNull } from '$lib/server/streaming';
import { listGroupLessons } from '$lib/server/scheduling/group-lessons';

export const load: PageServerLoad = ({ locals: { supabase } }) => {
	// Streamed so the page renders at once with a skeleton; null when it can't be loaded
	const lessons = orNull(
		listGroupLessons(supabase, { includeEnded: true }).then((all) => ({
			running: all.filter((l) => !l.endDate),
			ended: all
				.filter((l) => l.endDate)
				.sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''))
		})),
		'group lessons'
	);
	return { lessons };
};
