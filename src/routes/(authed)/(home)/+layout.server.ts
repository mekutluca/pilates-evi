import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// Studio lists the staff pages pick from; loaded on every navigation, so only what the UI uses
export const load: LayoutServerLoad = async ({ locals: { supabase, user, userRole } }) => {
	if (!user) throw error(401, 'Oturum açmanız gerekiyor');

	// Trainers and trainees see only their own pages: no studio lists (trainee notes, emails)
	if (userRole !== 'admin' && userRole !== 'coordinator') {
		return { trainers: [], rooms: [], trainees: [], packages: [] };
	}

	const [trainers, rooms, trainees, packages] = await Promise.all([
		supabase
			.from('pe_trainers')
			.select('id, name, phone, is_active, organization_id, sort_order')
			.order('sort_order', { ascending: true }),
		supabase
			.from('pe_rooms')
			.select('id, name, is_active, organization_id, sort_order')
			.order('sort_order', { ascending: true }),
		supabase
			.from('pe_trainees')
			.select('id, name, phone, email, notes, is_active, created_at, auth_id, organization_id'),
		supabase.from('pe_packages').select('*').order('created_at', { ascending: false })
	]);

	// Empty lists would read as "no trainees / no rooms"; the error page offers a retry
	const failed = trainers.error ?? rooms.error ?? trainees.error ?? packages.error;
	if (failed) {
		console.error('Error loading studio lists:', failed);
		throw error(500, 'Stüdyo bilgileri yüklenemedi. Sayfayı yenileyin.');
	}

	return {
		trainers: trainers.data ?? [],
		rooms: rooms.data ?? [],
		trainees: trainees.data ?? [],
		packages: packages.data ?? []
	};
};
