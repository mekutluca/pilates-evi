import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { SelectedGroupTimeslot } from '$lib/types';
import { requireStaff } from '$lib/server/permissions';
import { PurchaseRepository } from '$lib/server/repositories/purchase-repository';
import {
	getCanonicalPurchaseTimeSlots,
	getLastAppointmentDate
} from '$lib/server/scheduling/extension';
import { listGroupTimeslots } from '$lib/server/scheduling/group-lessons';
import { planRenewal } from '$lib/server/scheduling/lesson-plan';
import { parseRenewalForm } from '$lib/server/scheduling/lesson-plan-form';
import { JS_DAY_TO_NAME } from '$lib/types/Schedule';
import { formatDateForDB } from '$lib/utils/date-utils';
import { calculateExtensionStartDate } from '$lib/utils/slot-utils';

export const load: PageServerLoad = async ({ params, locals: { supabase }, parent }) => {
	const purchases = new PurchaseRepository(supabase);
	const last = await purchases.findLastInChain(params.purchaseId);
	if (!last) throw error(404, 'Kayıt bulunamadı');

	const [{ rooms, trainers }, packageRes, teamRes, lastLessonDate] = await Promise.all([
		parent(),
		supabase.from('pe_packages').select('*').eq('id', last.package_id).single(),
		supabase.from('pe_teams').select('pe_trainees(id, name)').eq('id', last.team_id),
		getLastAppointmentDate(supabase, last.id)
	]);
	const pkg = packageRes.data;
	if (!pkg) throw error(404, 'Paket bulunamadı');
	const isGroup = pkg.package_type === 'group';

	const { slots, timeslotGroupLessons } = await getCanonicalPurchaseTimeSlots(
		supabase,
		last.id,
		isGroup ? 'group' : 'private',
		pkg.weeks_duration ?? 0
	);

	// Current room and trainer: the kayıt's latest lesson
	const { data: latest } = await supabase
		.from('pe_appointments')
		.select('room_id, trainer_id')
		.eq('purchase_id', last.id)
		.order('date', { ascending: false })
		.order('hour', { ascending: false })
		.limit(1)
		.maybeSingle();

	const currentGroupSlots: SelectedGroupTimeslot[] = isGroup
		? slots.flatMap((s) => {
				const groupLessonId = timeslotGroupLessons.get(
					`${JS_DAY_TO_NAME.indexOf(s.day)}-${s.hour}`
				);
				return groupLessonId ? [{ group_lesson_id: groupLessonId, day: s.day, hour: s.hour }] : [];
			})
		: [];

	return {
		purchaseId: last.id,
		package: pkg,
		isGroup,
		trainees: (teamRes.data ?? []).map((t) => t.pe_trainees),
		earliestStart: formatDateForDB(calculateExtensionStartDate(lastLessonDate)),
		lastLessonDate: lastLessonDate ? formatDateForDB(lastLessonDate) : null,
		currentSlots: slots,
		currentRoomId: latest?.room_id ?? rooms.find((r) => r.is_active)?.id ?? '',
		currentTrainerId: latest?.trainer_id ?? trainers.find((t) => t.is_active)?.id ?? '',
		currentGroupSlots,
		groupTimeslots: isGroup ? await listGroupTimeslots(supabase, pkg.id) : [],
		rooms: rooms.filter((r) => r.is_active),
		trainers: trainers.filter((t) => t.is_active)
	};
};

export const actions: Actions = {
	preview: async ({ request, params, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const input = parseRenewalForm(await request.formData(), params.purchaseId);
		if (typeof input === 'string') return fail(400, { success: false, message: input });
		const plan = await planRenewal(supabase, input);
		if (typeof plan === 'string') return fail(400, { success: false, message: plan });

		return {
			success: true,
			sessions: plan.sessions,
			conflicts: plan.conflicts,
			fullSessions: plan.fullSessions,
			duplicateSessions: plan.duplicateSessions
		};
	},

	renew: async ({ request, params, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const input = parseRenewalForm(await request.formData(), params.purchaseId);
		if (typeof input === 'string') return fail(400, { success: false, message: input });
		const plan = await planRenewal(supabase, input);
		if (typeof plan === 'string') return fail(400, { success: false, message: plan });
		if (plan.conflicts.length > 0 || plan.fullSessions > 0 || plan.duplicateSessions > 0) {
			return fail(400, {
				success: false,
				message: 'Seçilen saatlerde çakışma var; kayıt yenilenmedi'
			});
		}

		try {
			const result = await new PurchaseRepository(supabase).extend(
				plan.predecessorId,
				plan.rescheduleLeft,
				plan.chunks
			);
			return {
				success: true,
				message: `Kayıt yenilendi: ${plan.sessions.length} ders (${result.purchases_created} dönem).`,
				redirectTo: `/trainees/${params.id}`
			};
		} catch (extendError) {
			return fail(500, {
				success: false,
				message: extendError instanceof Error ? extendError.message : 'Yenileme başarısız'
			});
		}
	}
};
