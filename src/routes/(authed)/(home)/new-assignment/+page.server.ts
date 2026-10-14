import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/permissions';
import { ConflictService } from '$lib/server/services/conflict-service';
import { SchedulingService } from '$lib/server/services/scheduling-service';
import { TraineeRepository } from '$lib/server/repositories/trainee-repository';
import { listGroupTimeslots } from '$lib/server/scheduling/group-lessons';
import { planAssignment } from '$lib/server/scheduling/lesson-plan';
import { parseAssignmentForm } from '$lib/server/scheduling/lesson-plan-form';
import { SCHEDULE_HOURS } from '$lib/types/Schedule';
import { getRequiredFormDataString } from '$lib/utils/form-utils';
import { addDays, formatDateForDB, parseLocalDate } from '$lib/utils/date-utils';
import { isIsoDate, isValidUuid } from '$lib/utils/validation';

export const load: PageServerLoad = async ({ locals: { user, userRole }, url, parent }) => {
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	const { packages, rooms, trainers, trainees } = await parent();
	const activePackages = packages
		.filter((p) => p.is_active !== false)
		.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
	const activeRooms = rooms.filter((r) => r.is_active);
	const activeTrainers = trainers.filter((t) => t.is_active);
	const activeTrainees = trainees
		.filter((t) => t.is_active)
		.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

	// Prefill from the page that opened the wizard: a trainee (?trainee_id), a calendar
	// slot (?date&hour&room_id|trainer_id) or a group lesson (?package_id&group_lesson_id)
	const param = (name: string) => url.searchParams.get(name) ?? '';
	const known = <T extends { id: string }>(list: T[], id: string) =>
		list.some((item) => item.id === id) ? id : '';
	const today = formatDateForDB(new Date());
	const date = param('date');
	const hour = Number(param('hour'));

	return {
		packages: activePackages,
		rooms: activeRooms,
		trainers: activeTrainers,
		trainees: activeTrainees,
		prefill: {
			traineeId: known(activeTrainees, param('trainee_id')),
			packageId: known(activePackages, param('package_id')),
			groupLessonId: isValidUuid(param('group_lesson_id')) ? param('group_lesson_id') : '',
			roomId: known(activeRooms, param('room_id')),
			trainerId: known(activeTrainers, param('trainer_id')),
			startDate: isIsoDate(date) && date >= today ? date : today,
			hour: SCHEDULE_HOURS.includes(hour) && isIsoDate(date) ? hour : null
		}
	};
};

export const actions: Actions = {
	// Weekly slots taken for the room or trainer over the kayıt's weeks
	availability: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const roomId = getRequiredFormDataString(formData, 'roomId');
		const trainerId = getRequiredFormDataString(formData, 'trainerId');
		const startDate = getRequiredFormDataString(formData, 'startDate');
		const weeks = Number(getRequiredFormDataString(formData, 'weeks'));
		if (
			!isValidUuid(roomId) ||
			!isValidUuid(trainerId) ||
			!isIsoDate(startDate) ||
			!Number.isInteger(weeks) ||
			weeks < 1 ||
			weeks > 156
		) {
			return fail(400, { success: false, message: 'Geçersiz parametre' });
		}

		const busy = await new ConflictService(supabase).findBusyWeeklySlots({
			roomId,
			trainerId,
			fromDate: startDate,
			toDate: formatDateForDB(addDays(parseLocalDate(startDate), weeks * 7))
		});
		return { success: true, busy };
	},

	groupTimeslots: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const packageId = getRequiredFormDataString(await request.formData(), 'packageId');
		if (!isValidUuid(packageId)) return fail(400, { success: false, message: 'Geçersiz paket' });
		return { success: true, timeslots: await listGroupTimeslots(supabase, packageId) };
	},

	createTrainee: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const input = TraineeRepository.parseForm(await request.formData());
		if (typeof input === 'string') return fail(400, { success: false, message: input });

		const id = crypto.randomUUID();
		const createError = await new TraineeRepository(supabase).create(input, id);
		if (createError) return fail(400, { success: false, message: createError });

		return {
			success: true,
			message: `${input.name} eklendi`,
			trainee: { id, name: input.name, phone: input.phone }
		};
	},

	preview: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const input = parseAssignmentForm(await request.formData());
		if (typeof input === 'string') return fail(400, { success: false, message: input });
		const plan = await planAssignment(supabase, input);
		if (typeof plan === 'string') return fail(400, { success: false, message: plan });

		return {
			success: true,
			sessions: plan.sessions,
			conflicts: plan.conflicts,
			fullSessions: plan.fullSessions,
			duplicateSessions: plan.duplicateSessions
		};
	},

	create: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const input = parseAssignmentForm(await request.formData());
		if (typeof input === 'string') return fail(400, { success: false, message: input });
		const plan = await planAssignment(supabase, input);
		if (typeof plan === 'string') return fail(400, { success: false, message: plan });
		if (plan.conflicts.length > 0 || plan.fullSessions > 0 || plan.duplicateSessions > 0) {
			return fail(400, {
				success: false,
				message: 'Seçilen saatlerde çakışma var; kayıt oluşturulmadı'
			});
		}

		try {
			await new SchedulingService(supabase).createAssignment(plan.payload);
		} catch (createError) {
			return fail(500, {
				success: false,
				message: createError instanceof Error ? createError.message : 'Kayıt oluşturulamadı'
			});
		}

		// One trainee: their page shows the new kayıt; several: the week it starts
		const [onlyTrainee] = input.traineeIds.length === 1 ? input.traineeIds : [];
		return {
			success: true,
			message: `Kayıt oluşturuldu: ${plan.sessions.length} ders.`,
			redirectTo: onlyTrainee
				? `/trainees/${onlyTrainee}`
				: `/schedule?week=${plan.sessions[0]?.date ?? ''}`
		};
	}
};
