import type { PageServerLoad } from './$types';
import type { Panel } from '$lib/types/Dashboard';
import { loadStudioPanel, loadTrainerPanel } from '$lib/server/panel';
import { orNull } from '$lib/server/streaming';

export const load: PageServerLoad = ({ locals: { supabase, user, userRole } }) => {
	// Streamed so the page shell renders at once; null when it can't be loaded
	return { panel: loadPanel() };

	function loadPanel(): Promise<Panel | null> {
		if (!user) return Promise.resolve(null);
		switch (userRole) {
			case 'admin':
			case 'coordinator':
				return orNull(loadStudioPanel(supabase), 'panel');
			case 'trainer':
				// A trainer's account id is their pe_trainers id
				return orNull(loadTrainerPanel(supabase, user.id), 'panel');
			default:
				return Promise.resolve({ kind: 'trainee' });
		}
	}
};
