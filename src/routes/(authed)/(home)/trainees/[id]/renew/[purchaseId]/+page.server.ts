import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Purchase, Room, SelectedGroupTimeslot, Trainer } from '$lib/types';
import type { RenewalFormData } from '$lib/types/Extension';
import type { SupabaseClientType } from '$lib/types/Supabase';
import { requireStaff } from '$lib/server/permissions';
import { orNull } from '$lib/server/streaming';
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

// Everything the Yenile form starts from: the kayıt's package, team and current pattern
async function loadRenewal(
	supabase: SupabaseClientType,
	last: Purchase,
	rooms: Room[],
	trainers: Trainer[]
): Promise<RenewalFormData | null> {
	const [packageRes, teamRes, lastLessonDate] = await Promise.all([
		supabase.from('pe_packages').select('*').eq('id', last.package_id).single(),
		supabase.from('pe_teams').select('pe_trainees(id, name)').eq('id', last.team_id),
		getLastAppointmentDate(supabase, last.id)
	]);
	const pkg = packageRes.data;
	if (!pkg) return null;
	const isGroup = pkg.package_type === 'group';

	const [{ slots, timeslotGroupLessons }, { data: latest }, groupTimeslots] = await Promise.all([
		getCanonicalPurchaseTimeSlots(supabase, last.id, isGroup ? 'group' : 'private'),
		// Current room and trainer: the kayıt's latest lesson
		supabase
			.from('pe_appointments')
			.select('room_id, trainer_id')
			.eq('purchase_id', last.id)
			.order('date', { ascending: false })
			.order('hour', { ascending: false })
			.limit(1)
			.maybeSingle(),
		isGroup ? listGroupTimeslots(supabase, pkg.id) : Promise.resolve([])
	]);

	const currentGroupSlots: SelectedGroupTimeslot[] = isGroup
		? slots.flatMap((s) => {
				const groupLessonId = timeslotGroupLessons.get(
					`${JS_DAY_TO_NAME.indexOf(s.day)}-${s.hour}`
				);
				return groupLessonId ? [{ group_lesson_id: groupLessonId, day: s.day, hour: s.hour }] : [];
			})
		: [];

	return {
		package: pkg,
		isGroup,
		trainees: (teamRes.data ?? []).map((t) => t.pe_trainees),
		earliestStart: formatDateForDB(calculateExtensionStartDate(lastLessonDate)),
		lastLessonDate: lastLessonDate ? formatDateForDB(lastLessonDate) : null,
		currentSlots: slots,
		currentRoomId: latest?.room_id ?? rooms[0]?.id ?? '',
		currentTrainerId: latest?.trainer_id ?? trainers[0]?.id ?? '',
		currentGroupSlots,
		groupTimeslots
	};
}

export const load: PageServerLoad = async ({ params, locals: { supabase }, parent }) => {
	const last = await new PurchaseRepository(supabase).findLastInChain(params.purchaseId);
	if (!last) throw error(404, 'Kayıt bulunamadı');

	const { rooms, trainers } = await parent();
	const activeRooms = rooms.filter((r) => r.is_active);
	const activeTrainers = trainers.filter((t) => t.is_active);
	return {
		// Streamed so the page shows its skeleton at once; null when it can't be loaded
		renewal: orNull(loadRenewal(supabase, last, activeRooms, activeTrainers), 'renewal'),
		rooms: activeRooms,
		trainers: activeTrainers
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
				message: 'Seçilen saatlerde çakışma var, kayıt yenilenmedi'
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
				message: extendError instanceof Error ? extendError.message : 'Kayıt yenilenemedi'
			});
		}
	}
};
