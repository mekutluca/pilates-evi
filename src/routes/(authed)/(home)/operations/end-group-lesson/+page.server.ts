import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { EndableGroupLesson, GroupLessonQueryRow } from '$lib/types/Operation';
import { getRequiredFormDataString } from '$lib/utils/form-utils';
import { formatDateForDB, getTomorrow, parseLocalDate } from '$lib/utils/date-utils';
import { SchedulingService } from '$lib/server/services/scheduling-service';
import { isValidUuid } from '$lib/utils/validation';
import { requireStaff } from '$lib/server/permissions';

function dayAfter(dateStr: string): string {
	const date = parseLocalDate(dateStr);
	date.setDate(date.getDate() + 1);
	return formatDateForDB(date);
}

// Active group lessons with their earliest end dates — streamed so the page
// shell renders immediately; resolves to null on error.
async function loadGroupLessons(
	supabase: SupabaseClient<Database>
): Promise<EndableGroupLesson[] | null> {
	// One roundtrip: lessons with their enrolled appointments embedded. The
	// nested !inner join keeps only appointments that have at least one
	// trainee record; lessons without any still return with an empty array.
	const { data: lessons, error: lessonsError } = await supabase
		.from('pe_group_lessons')
		.select(
			`
			id,
			start_date,
			timeslots,
			pe_packages(name),
			pe_rooms(name),
			pe_trainers(name),
			pe_appointments(date, pe_appointment_trainees!inner(trainee_id))
		`
		)
		.is('end_date', null);

	if (lessonsError) {
		console.error('Error loading group lessons:', lessonsError);
		return null;
	}

	const typedLessons = (lessons as GroupLessonQueryRow[] | null) ?? [];
	const today = formatDateForDB(new Date());
	const tomorrow = formatDateForDB(getTomorrow());

	return typedLessons
		.map((gl) => {
			let lastEnrolledDate: string | null = null;
			const activeTrainees = new Set<string>();
			for (const appointment of gl.pe_appointments) {
				if (!appointment.date) continue;
				if (!lastEnrolledDate || appointment.date > lastEnrolledDate) {
					lastEnrolledDate = appointment.date;
				}
				if (appointment.date >= today) {
					for (const enrollment of appointment.pe_appointment_trainees) {
						if (enrollment.trainee_id) activeTrainees.add(enrollment.trainee_id);
					}
				}
			}
			const afterLastEnrolled = lastEnrolledDate ? dayAfter(lastEnrolledDate) : tomorrow;
			return {
				id: gl.id,
				packageName: gl.pe_packages?.name ?? '',
				roomName: gl.pe_rooms?.name ?? '',
				trainerName: gl.pe_trainers?.name ?? '',
				startDate: gl.start_date,
				timeslots: gl.timeslots ?? [],
				lastEnrolledDate,
				traineeCount: activeTrainees.size,
				minEndDate: afterLastEnrolled > tomorrow ? afterLastEnrolled : tomorrow
			};
		})
		.sort((a, b) => a.packageName.localeCompare(b.packageName, 'tr'));
}

export const load: PageServerLoad = ({ locals: { supabase, user, userRole } }) => {
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	return { groupLessons: loadGroupLessons(supabase) };
};

export const actions: Actions = {
	endGroupLesson: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const groupLessonId = getRequiredFormDataString(formData, 'groupLessonId');
		const endDate = getRequiredFormDataString(formData, 'endDate');

		if (!isValidUuid(groupLessonId)) {
			return fail(400, { success: false, message: 'Geçersiz grup dersi' });
		}

		// Local-time backstop for the UI constraint; the RPC re-validates the
		// last-enrolled-appointment rule transactionally.
		if (endDate < formatDateForDB(getTomorrow())) {
			return fail(400, {
				success: false,
				message: 'Bitiş tarihi en erken yarın olabilir'
			});
		}

		let deletedCount = 0;
		try {
			const result = await new SchedulingService(supabase).endGroupLesson(groupLessonId, endDate);
			deletedCount = result.deleted_count;
		} catch (err) {
			console.error('Group lesson end error:', err);
			const errorMessage = err instanceof Error ? err.message : 'Bilinmeyen hata';
			return fail(400, { success: false, message: errorMessage });
		}

		const message =
			deletedCount > 0
				? `Grup dersi sonlandırıldı, ${deletedCount} boş randevu silindi.`
				: 'Grup dersi sonlandırıldı.';

		return { success: true, message };
	}
};
