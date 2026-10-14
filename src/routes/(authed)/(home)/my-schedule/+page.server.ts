import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getWeekStart, getWeekEnd, formatDateForDB, parseLocalDate } from '$lib/utils/date-utils';
import { isIsoDate } from '$lib/utils/validation';
import { TRAINER_APPOINTMENTS_WITH_RELATIONS_SELECT } from '$lib/server/repositories/appointment-repository';

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

	const { data: appointments, error: appointmentsError } = await supabase
		.from('pe_appointments')
		.select(TRAINER_APPOINTMENTS_WITH_RELATIONS_SELECT)
		.eq('trainer_id', trainer.id)
		.gte('date', formatDateForDB(weekStart))
		.lte('date', formatDateForDB(getWeekEnd(weekStart)))
		.order('date', { ascending: true })
		.order('hour', { ascending: true });
	if (appointmentsError) {
		console.error('Error fetching trainer appointments:', appointmentsError);
	}

	return {
		appointments: appointments ?? [],
		trainerName: trainer.name ?? '',
		weekStart: formatDateForDB(weekStart)
	};
};
