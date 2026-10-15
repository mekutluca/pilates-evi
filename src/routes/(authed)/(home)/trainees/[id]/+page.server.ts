import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { KayitLesson, RemainingLessonsScope, SharedTrainee, TraineeKayit } from '$lib/types';
import { getRequiredFormDataString, isAppointmentFuture } from '$lib/utils';
import { requireStaff } from '$lib/server/permissions';
import { SchedulingService } from '$lib/server/services/scheduling-service';
import { NO_REMAINING_LESSONS } from '$lib/server/scheduling/purchase-deletion';
import { TraineeRepository } from '$lib/server/repositories/trainee-repository';
import { compareSlots, recurringPattern } from '$lib/utils/slot-utils';
import { isNonNull } from '$lib/utils/type-guards';
import { isValidUuid } from '$lib/utils/validation';
import { orNull } from '$lib/server/streaming';

export const load: PageServerLoad = ({ params, locals: { supabase } }) => {
	const traineeId = params.id;
	if (!isValidUuid(traineeId)) throw error(404, 'Öğrenci bulunamadı');

	// Trainee details, streamed so the page shell renders at once; `trainee` null = not found
	const loadTrainee = async () => {
		const { data: trainee, error: traineeError } = await supabase
			.from('pe_trainees')
			.select('*')
			.eq('id', traineeId)
			.maybeSingle();
		if (traineeError) throw traineeError;
		return { trainee };
	};

	// Kayıtlar (purchase chains) with their lessons, streamed
	const loadKayitlar = async (): Promise<TraineeKayit[]> => {
		const { data: teams, error: teamError } = await supabase
			.from('pe_teams')
			.select('id')
			.eq('trainee_id', traineeId);
		if (teamError) throw teamError;

		const [purchasesRes, lessonsRes] = await Promise.all([
			supabase
				.from('pe_purchases')
				.select(
					'id, created_at, successor_id, reschedule_left, lesson_count, pe_packages(name, package_type)'
				)
				.in(
					'team_id',
					(teams ?? []).map((t) => t.id)
				),
			supabase
				.from('pe_appointment_trainees')
				.select(
					'purchase_id, pe_appointments!inner(id, date, hour, room_id, pe_rooms(name), pe_trainers(name))'
				)
				.eq('trainee_id', traineeId)
		]);
		if (purchasesRes.error) throw purchasesRes.error;
		if (lessonsRes.error) throw lessonsRes.error;
		const purchases = purchasesRes.data ?? [];

		const lessonsByPurchase = new Map<string, KayitLesson[]>();
		for (const row of lessonsRes.data ?? []) {
			const a = row.pe_appointments;
			const list = lessonsByPurchase.get(row.purchase_id) ?? [];
			list.push({
				appointmentId: a.id,
				date: a.date,
				hour: a.hour,
				roomId: a.room_id,
				roomName: a.pe_rooms.name ?? '',
				trainerName: a.pe_trainers.name ?? ''
			});
			lessonsByPurchase.set(row.purchase_id, list);
		}

		// Teammates on the same private purchases (upcoming lessons only). Group lessons never
		// match here because each attendee is linked under their own purchase.
		const sharedByPurchase = new Map<string, Map<string, SharedTrainee>>();
		if (purchases.length > 0) {
			const { data: teammateRows, error: teammateError } = await supabase
				.from('pe_appointment_trainees')
				.select('purchase_id, pe_trainees(id, name), pe_appointments!inner(date, hour)')
				.in(
					'purchase_id',
					purchases.map((p) => p.id)
				)
				.neq('trainee_id', traineeId);
			if (teammateError) throw teammateError;
			for (const row of teammateRows ?? []) {
				if (!isAppointmentFuture(row.pe_appointments.date, row.pe_appointments.hour)) continue;
				const bucket = sharedByPurchase.get(row.purchase_id) ?? new Map<string, SharedTrainee>();
				bucket.set(row.pe_trainees.id, { id: row.pe_trainees.id, name: row.pe_trainees.name });
				sharedByPurchase.set(row.purchase_id, bucket);
			}
		}

		// Chains start at purchases that aren't anyone's successor
		const byId = new Map(purchases.map((p) => [p.id, p]));
		const successorIds = new Set(purchases.map((p) => p.successor_id).filter(isNonNull));
		const kayitlar: TraineeKayit[] = [];
		for (const root of purchases.filter((p) => !successorIds.has(p.id))) {
			const chain = [root];
			for (
				let next = root.successor_id;
				next && byId.has(next);
				next = byId.get(next)!.successor_id
			) {
				chain.push(byId.get(next)!);
			}
			const current = chain[chain.length - 1];
			const lessons = chain.flatMap((p) => lessonsByPurchase.get(p.id) ?? []).sort(compareSlots);
			const upcoming = lessons.filter((l) => isAppointmentFuture(l.date, l.hour));
			const patternSource = upcoming.length > 0 ? upcoming : lessons;
			const latest = patternSource[patternSource.length - 1];
			const shared = new Map<string, SharedTrainee>();
			chain.forEach((p) => sharedByPurchase.get(p.id)?.forEach((t) => shared.set(t.id, t)));

			kayitlar.push({
				id: root.id,
				currentPurchaseId: current.id,
				purchaseIds: chain.map((p) => p.id),
				packageName: root.pe_packages.name,
				isGroup: root.pe_packages.package_type === 'group',
				lessonCount: chain.reduce((sum, p) => sum + p.lesson_count, 0),
				creditsLeft: current.reschedule_left,
				lessons,
				upcoming,
				slots: recurringPattern(patternSource),
				roomName: latest?.roomName ?? '',
				trainerName: latest?.trainerName ?? '',
				sharedTrainees: [...shared.values()]
			});
		}

		// Running kayıtlar first, then the most recent
		return kayitlar.sort(
			(a, b) =>
				Number(b.upcoming.length > 0) - Number(a.upcoming.length > 0) ||
				(b.lessons.at(-1)?.date ?? '').localeCompare(a.lessons.at(-1)?.date ?? '')
		);
	};

	// null when a query failed: the page shows a load error with a retry
	return {
		trainee: orNull(loadTrainee(), 'trainee'),
		kayitlar: orNull(loadKayitlar(), 'kayıtlar')
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const input = TraineeRepository.parseForm(await request.formData());
		if (typeof input === 'string') return fail(400, { success: false, message: input });

		const updateError = await new TraineeRepository(supabase).update(params.id, input);
		if (updateError) return fail(400, { success: false, message: updateError });

		return { success: true, message: 'Öğrenci başarıyla güncellendi' };
	},

	archiveTrainee: async ({ params, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const archiveError = await new TraineeRepository(supabase).setActive(params.id, false);
		if (archiveError) return fail(400, { success: false, message: archiveError });

		return { success: true, message: 'Öğrenci başarıyla arşivlendi' };
	},

	restoreTrainee: async ({ params, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const restoreError = await new TraineeRepository(supabase).setActive(params.id, true);
		if (restoreError) return fail(400, { success: false, message: restoreError });

		return { success: true, message: 'Öğrenci başarıyla geri yüklendi' };
	},

	deleteRemainingLessons: async ({ request, params, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const scope: RemainingLessonsScope =
			formData.get('scope')?.toString() === 'all' ? 'all' : 'trainee';
		// A kayıt is a chain of purchases; each one with upcoming lessons is cleared
		const purchaseIds = getRequiredFormDataString(formData, 'purchaseIds').split(',');
		if (!purchaseIds.every(isValidUuid)) {
			return fail(400, { success: false, message: 'Kayıt bulunamadı. Sayfayı yenileyin.' });
		}

		const service = new SchedulingService(supabase);
		let deleted = 0;
		for (const purchaseId of purchaseIds) {
			const result = await service.deleteRemainingLessons(purchaseId, params.id, scope);
			// Earlier purchases of the chain usually have nothing left; that's not a failure
			if (result.error && result.error !== NO_REMAINING_LESSONS) {
				// Purchases already cleared stay cleared: say so, or the count on screen misleads
				const message =
					deleted > 0
						? `${deleted} ders silindi, kalanlar silinemedi. ${result.error}`
						: result.error;
				return fail(400, { success: false, message });
			}
			deleted += result.deletedCount;
		}
		if (deleted === 0) {
			return fail(400, { success: false, message: NO_REMAINING_LESSONS });
		}

		return { success: true, message: `${deleted} ders silindi` };
	}
};
