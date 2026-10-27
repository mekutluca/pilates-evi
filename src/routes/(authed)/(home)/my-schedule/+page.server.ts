import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { AttendanceService } from '$lib/server/services/attendance-service';
import { parseAttendance, parseEnrollmentId } from '$lib/server/scheduling/attendance-form';
import { getWeekStart, formatDateForDB, parseLocalDate } from '$lib/utils/date-utils';
import { isIsoDate } from '$lib/utils/validation';
import { AppointmentRepository } from '$lib/server/repositories/appointment-repository';
import { orNull } from '$lib/server/streaming';

export const load: PageServerLoad = async ({ locals: { supabase, user, userRole }, url }) => {
	if (!user || userRole !== 'trainer') {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	// A trainer's account id is their pe_trainers id
	const { data: trainer, error: trainerError } = await supabase
		.from('pe_trainers')
		.select('id, name')
		.eq('id', user.id)
		.maybeSingle();
	if (trainerError) {
		console.error('Error loading trainer:', trainerError);
		throw error(500, 'Takviminiz yüklenemedi. Sayfayı yenileyin.');
	}
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

export const actions: Actions = {
	// Yoklama for the trainer's own lessons; the RPC checks the lesson is theirs
	markAttendance: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || userRole !== 'trainer') {
			return fail(403, { success: false, message: 'Bu işlem için yetkiniz yok' });
		}
		const formData = await request.formData();
		const enrollmentId = parseEnrollmentId(formData);
		if (typeof enrollmentId === 'string')
			return fail(400, { success: false, message: enrollmentId });
		const mark = parseAttendance(formData);
		if (typeof mark === 'string') return fail(400, { success: false, message: mark });

		const markError = await new AttendanceService(supabase).mark(enrollmentId, mark.attendance);
		if (markError) return fail(400, { success: false, message: markError });
		return { success: true, message: 'Yoklama kaydedildi' };
	}
};
