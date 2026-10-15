import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getWeekStart, formatDateForDB, parseLocalDate } from '$lib/utils/date-utils';
import { isIsoDate } from '$lib/utils/validation';
import { AppointmentRepository } from '$lib/server/repositories/appointment-repository';
import { orNull } from '$lib/server/streaming';

export const load: PageServerLoad = async ({ locals: { supabase, user, userRole }, url }) => {
	if (!user || userRole !== 'trainer') {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	// A trainer's account id is their pe_trainers id
	const { data: trainer } = await supabase
		.from('pe_trainers')
		.select('id, name')
		.eq('id', user.id)
		.single();
	if (!trainer) throw error(404, 'Eğitmen kaydınız bulunamadı');

	// Week from the URL (any day of it), defaulting to the current week
	const weekParam = url.searchParams.get('week');
	const weekStart = getWeekStart(
		weekParam && isIsoDate(weekParam) ? parseLocalDate(weekParam) : new Date()
	);

	return {
		// Streamed: the page shows the board skeleton until the week arrives; null if it failed
		appointments: orNull(
			new AppointmentRepository(supabase).getWeek(weekStart, trainer.id),
			'week'
		),
		trainerName: trainer.name ?? '',
		weekStart: formatDateForDB(weekStart)
	};
};
