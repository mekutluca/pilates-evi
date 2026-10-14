import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/permissions';
import { planGroupLesson } from '$lib/server/scheduling/group-lessons';
import { parseNewGroupLessonForm } from '$lib/server/scheduling/group-lesson-form';
import { SchedulingService } from '$lib/server/services/scheduling-service';
import { formatDateForDB } from '$lib/utils/date-utils';
import { isIsoDate } from '$lib/utils/validation';

export const load: PageServerLoad = async ({ parent, url }) => {
	const { packages, rooms, trainers } = await parent();
	const groupPackages = packages
		.filter((p) => p.package_type === 'group' && p.is_active !== false)
		.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
	const activeRooms = rooms.filter((r) => r.is_active);
	const activeTrainers = trainers.filter((t) => t.is_active);

	// Prefill from the calendar or a package (?package_id, ?room_id, ?trainer_id, ?date)
	const pick = <T extends { id: string }>(list: T[], param: string) =>
		list.find((item) => item.id === url.searchParams.get(param))?.id ?? list[0]?.id ?? '';
	const date = url.searchParams.get('date');
	const today = formatDateForDB(new Date());

	return {
		packages: groupPackages,
		rooms: activeRooms,
		trainers: activeTrainers,
		initial: {
			packageId: pick(groupPackages, 'package_id'),
			roomId: pick(activeRooms, 'room_id'),
			trainerId: pick(activeTrainers, 'trainer_id'),
			startDate: date && isIsoDate(date) && date >= today ? date : today
		}
	};
};

export const actions: Actions = {
	preview: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const input = parseNewGroupLessonForm(await request.formData());
		if (typeof input === 'string') return fail(400, { success: false, message: input });
		const plan = await planGroupLesson(supabase, input);
		if (typeof plan === 'string') return fail(400, { success: false, message: plan });

		// Same shape as the kayıt previews; a new lesson has no trainees to fit
		return {
			success: true,
			sessions: plan.sessions,
			conflicts: plan.conflicts,
			fullSessions: 0,
			duplicateSessions: 0
		};
	},

	create: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const input = parseNewGroupLessonForm(await request.formData());
		if (typeof input === 'string') return fail(400, { success: false, message: input });
		const plan = await planGroupLesson(supabase, input);
		if (typeof plan === 'string') return fail(400, { success: false, message: plan });
		if (plan.conflicts.length > 0) {
			return fail(400, {
				success: false,
				message: `${plan.conflicts.length} saatte oda veya eğitmen dolu; grup dersi açılmadı`
			});
		}

		try {
			const result = await new SchedulingService(supabase).createAssignment(plan.payload);
			return {
				success: true,
				message: `Grup dersi açıldı: ${result.appointments_created} ders oluşturuldu.`,
				redirectTo: result.group_lesson_id
					? `/group-lessons/${result.group_lesson_id}`
					: '/group-lessons'
			};
		} catch (createError) {
			return fail(500, {
				success: false,
				message: createError instanceof Error ? createError.message : 'Grup dersi açılamadı'
			});
		}
	}
};
