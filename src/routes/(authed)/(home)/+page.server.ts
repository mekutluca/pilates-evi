import type { PageServerLoad } from './$types';
import type { Panel } from '$lib/types/Dashboard';
import { loadStudioPanel, loadTrainerPanel } from '$lib/server/panel';

export const load: PageServerLoad = ({ locals: { supabase, user, userRole } }) => {
	// Streamed so the page shell renders at once; null when it can't be loaded
	const load = async (): Promise<Panel | null> => {
		if (!user) return null;
		try {
			// A trainer's account id is their pe_trainers id
			return userRole === 'trainer'
				? await loadTrainerPanel(supabase, user.id)
				: await loadStudioPanel(supabase);
		} catch (panelError) {
			console.error('Error loading panel:', panelError);
			return null;
		}
	};
	return { panel: load() };
};
