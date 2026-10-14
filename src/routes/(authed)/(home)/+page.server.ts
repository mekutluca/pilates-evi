import type { PageServerLoad } from './$types';
import type { Panel } from '$lib/types/Dashboard';
import { loadStudioPanel, loadTrainerPanel } from '$lib/server/panel';
import { orNull } from '$lib/server/streaming';

export const load: PageServerLoad = ({ locals: { supabase, user, userRole } }) => {
	// Streamed so the page shell renders at once; null when it can't be loaded.
	// A trainer's account id is their pe_trainers id.
	const panel: Promise<Panel | null> = !user
		? Promise.resolve(null)
		: userRole === 'trainer'
			? orNull(loadTrainerPanel(supabase, user.id), 'panel')
			: orNull(loadStudioPanel(supabase), 'panel');
	return { panel };
};
