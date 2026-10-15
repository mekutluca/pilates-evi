import type { SupabaseClientType } from '$lib/types/Supabase';
import type { LessonPlan, LessonPlanInput, RenewalInput, RenewalPlan } from '$lib/types/Extension';
import type {
	AssignmentEnrollmentPayload,
	AssignmentInput,
	AssignmentPlan,
	AssignmentPurchasePayload
} from '$lib/types/Assignment';
import type { Package, SelectedGroupTimeslot } from '$lib/types';
import { dbErrorMessage } from '$lib/server/db-errors';
import { PurchaseRepository } from '$lib/server/repositories/purchase-repository';
import { ConflictService } from '$lib/server/services/conflict-service';
import { collectGroupSessions } from '$lib/server/scheduling/group-lessons';
import {
	formatDateForDB,
	formatDisplayDate,
	isAppointmentFuture,
	parseLocalDate
} from '$lib/utils/date-utils';
import { getLastAppointmentDate } from '$lib/server/scheduling/extension';
import {
	buildAppointmentSlotsFromStart,
	calculateExtensionStartDate,
	getStartingAppointmentCandidates,
	weeklySlotKey
} from '$lib/utils/slot-utils';
import { isIntInRange, isValidUuid, MAX_GROUP_WEEKS, MAX_PERIODS } from '$lib/utils/validation';

// A package's weekly lesson count must fall between its min and max
function lessonsPerWeekError(pkg: Package, count: number): string | null {
	if (count >= pkg.min_lessons_per_week && count <= pkg.max_lessons_per_week) return null;
	return pkg.min_lessons_per_week === pkg.max_lessons_per_week
		? `Bu paket için haftada ${pkg.min_lessons_per_week} ders seçilmeli`
		: `Bu paket için haftada ${pkg.min_lessons_per_week}–${pkg.max_lessons_per_week} ders seçilmeli`;
}

// New private lessons need a room and trainer that are in use (not archived)
async function activePlaceError(
	supabase: SupabaseClientType,
	roomId: string,
	trainerId: string
): Promise<string | null> {
	const [{ data: room }, { data: trainer }] = await Promise.all([
		supabase.from('pe_rooms').select('is_active').eq('id', roomId).maybeSingle(),
		supabase.from('pe_trainers').select('is_active').eq('id', trainerId).maybeSingle()
	]);
	if (!room?.is_active) return 'Seçilen oda bulunamadı ya da arşivde';
	if (!trainer?.is_active) return 'Seçilen eğitmen bulunamadı ya da arşivde';
	return null;
}

// Joined group lessons must be this package's and still running
async function openGroupLessonsError(
	supabase: SupabaseClientType,
	packageId: string,
	slots: SelectedGroupTimeslot[]
): Promise<string | null> {
	const ids = [...new Set(slots.map((s) => s.group_lesson_id))];
	const { data, error } = await supabase
		.from('pe_group_lessons')
		.select('id, package_id, end_date')
		.in('id', ids);
	if (error) return dbErrorMessage(error, 'Grup dersleri kontrol edilemedi. Tekrar deneyin.');
	const open = (data ?? []).filter((l) => l.package_id === packageId && l.end_date === null);
	return open.length === ids.length
		? null
		: 'Seçilen grup dersi bu pakete ait değil ya da sona ermiş';
}

// Reschedule credits a new purchase of the package starts with
function initialRescheduleCredits(pkg: Package): number {
	return pkg.reschedulable ? (pkg.reschedule_limit ?? 999) : 0;
}

/**
 * Plans a kayıt's lessons from the start date on: a private pattern's new lessons for N
 * periods (the first one is the first upcoming slot on or after the start date), or the
 * group sessions to join for N weeks. Conflicts and capacity problems come back in the
 * plan; nothing is written. Returns an error message when the input itself is invalid.
 */
async function planLessons(
	supabase: SupabaseClientType,
	pkg: Package,
	input: LessonPlanInput,
	traineeIds: string[]
): Promise<LessonPlan | string> {
	if ((pkg.package_type === 'group') !== (input.kind === 'group')) return 'Paket türü uyuşmuyor';
	const plan: LessonPlan = {
		sessions: [],
		periods: [],
		groupSessionIds: [],
		conflicts: [],
		fullSessions: 0,
		duplicateSessions: 0
	};

	if (input.kind === 'private') {
		const countError = lessonsPerWeekError(pkg, input.timeSlots.length);
		if (countError) return countError;
		if (new Set(input.timeSlots.map(weeklySlotKey)).size < input.timeSlots.length) {
			return 'Aynı gün ve saat iki kez seçilmiş';
		}
		if (!pkg.weeks_duration) return 'Paket süresi belirsiz';
		if (!isIntInRange(input.periods, 1, MAX_PERIODS)) {
			return `Dönem sayısı 1 ile ${MAX_PERIODS} arasında olmalı`;
		}
		const placeError = await activePlaceError(supabase, input.roomId, input.trainerId);
		if (placeError) return placeError;

		// A slot earlier today has passed; the pattern then starts at the next one
		const first = getStartingAppointmentCandidates(
			input.timeSlots,
			parseLocalDate(input.startDate),
			input.timeSlots.length + 1
		).find((c) => isAppointmentFuture(c.date, c.hour));
		if (!first) return 'Başlangıç tarihi bulunamadı';
		const perPeriod = pkg.weeks_duration * input.timeSlots.length;
		plan.sessions = buildAppointmentSlotsFromStart(
			parseLocalDate(first.date),
			first.hour,
			input.timeSlots,
			perPeriod * input.periods
		);
		plan.periods = Array.from({ length: input.periods }, (_, i) =>
			plan.sessions.slice(i * perPeriod, (i + 1) * perPeriod)
		);
		plan.conflicts = await new ConflictService(supabase).findSlotConflicts({
			roomId: input.roomId,
			trainerId: input.trainerId,
			slots: plan.sessions
		});
		return plan;
	}

	const countError = lessonsPerWeekError(pkg, input.groupSlots.length);
	if (countError) return countError;
	if (!isIntInRange(input.weeks, 1, MAX_GROUP_WEEKS)) {
		return `Hafta sayısı 1 ile ${MAX_GROUP_WEEKS} arasında olmalı`;
	}

	const lessonError = await openGroupLessonsError(supabase, pkg.id, input.groupSlots);
	if (lessonError) return lessonError;

	const total = input.weeks * input.groupSlots.length;
	const sessions = await collectGroupSessions(supabase, input.groupSlots, input.startDate, total);
	if (typeof sessions === 'string') return sessions;
	if (sessions.length < total) {
		return `${total} ders için yeterli ileri tarihli grup dersi yok (${sessions.length} mevcut)`;
	}

	const { duplicates, overCapacity } = await new ConflictService(supabase).checkEnrollmentTargets({
		appointmentIds: sessions.map((s) => s.id),
		traineeIds
	});
	plan.sessions = sessions;
	plan.groupSessionIds = sessions.map((s) => s.id);
	plan.fullSessions = overCapacity.length;
	plan.duplicateSessions = new Set(duplicates.map((d) => d.appointmentId)).size;
	return plan;
}

/**
 * Plans renewing (Yenile) the kayıt that contains `purchaseId`: the new lessons are
 * chained after the kayıt's latest purchase.
 */
export async function planRenewal(
	supabase: SupabaseClientType,
	input: RenewalInput
): Promise<RenewalPlan | string> {
	const last = await new PurchaseRepository(supabase).findLastInChain(input.purchaseId);
	if (!last) return 'Kayıt bulunamadı';

	const [{ data: pkg }, { data: team }] = await Promise.all([
		supabase.from('pe_packages').select('*').eq('id', last.package_id).single(),
		supabase.from('pe_teams').select('trainee_id').eq('id', last.team_id)
	]);
	if (!pkg) return 'Paket bulunamadı';

	// The new lessons follow the kayıt's last one
	const earliestStart = formatDateForDB(
		calculateExtensionStartDate(await getLastAppointmentDate(supabase, last.id))
	);
	if (input.startDate < earliestStart) {
		return `Yeni dönem en erken ${formatDisplayDate(earliestStart)} tarihinde başlayabilir`;
	}

	const plan = await planLessons(
		supabase,
		pkg,
		input,
		(team ?? []).map((t) => t.trainee_id)
	);
	if (typeof plan === 'string') return plan;

	return {
		...plan,
		predecessorId: last.id,
		rescheduleLeft: initialRescheduleCredits(pkg),
		chunks:
			input.kind === 'private'
				? plan.periods.map((slots) => ({
						room_id: input.roomId,
						trainer_id: input.trainerId,
						slots
					}))
				: [{ appointment_ids: plan.groupSessionIds }]
	};
}

/**
 * Plans a new kayıt (Yeni kayıt). Private: the trainees share one kayıt, one purchase
 * per period, chained. Group: each trainee gets their own kayıt in the joined sessions.
 */
export async function planAssignment(
	supabase: SupabaseClientType,
	input: AssignmentInput
): Promise<AssignmentPlan | string> {
	if (input.traineeIds.length === 0) return 'En az bir öğrenci seçin';
	if (!input.traineeIds.every(isValidUuid)) return 'Geçersiz öğrenci';
	if (new Set(input.traineeIds).size < input.traineeIds.length)
		return 'Aynı öğrenci iki kez seçilmiş';

	const { data: pkg } = await supabase
		.from('pe_packages')
		.select('*')
		.eq('id', input.packageId)
		.maybeSingle();
	if (!pkg) return 'Paket bulunamadı';
	if (pkg.is_active === false) return 'Paket arşivde';
	if (input.kind === 'private' && input.traineeIds.length > pkg.max_capacity) {
		return `Bu pakette en fazla ${pkg.max_capacity} öğrenci olabilir`;
	}

	const plan = await planLessons(supabase, pkg, input, input.traineeIds);
	if (typeof plan === 'string') return plan;

	const rescheduleLeft = initialRescheduleCredits(pkg);
	const purchases: AssignmentPurchasePayload[] = [];
	const enrollments: AssignmentEnrollmentPayload[] = [];

	if (input.kind === 'private') {
		const appointments = plan.periods.flatMap((slots, period) => {
			const purchaseKey = `p${period}`;
			purchases.push({
				key: purchaseKey,
				package_id: pkg.id,
				reschedule_left: rescheduleLeft,
				trainee_ids: input.traineeIds,
				...(period > 0 && { extends_key: `p${period - 1}` })
			});
			return slots.map((slot, i) => {
				const key = `${period}-${i}`;
				enrollments.push(
					...input.traineeIds.map((traineeId) => ({
						purchase_key: purchaseKey,
						trainee_id: traineeId,
						appointment_key: key,
						session_number: i + 1,
						total_sessions: slots.length
					}))
				);
				return {
					key,
					room_id: input.roomId,
					trainer_id: input.trainerId,
					date: slot.date,
					hour: slot.hour,
					purchase_key: purchaseKey
				};
			});
		});
		return { ...plan, payload: { groupLesson: null, purchases, appointments, enrollments } };
	}

	for (const traineeId of input.traineeIds) {
		purchases.push({
			key: traineeId,
			package_id: pkg.id,
			reschedule_left: rescheduleLeft,
			trainee_ids: [traineeId]
		});
		enrollments.push(
			...plan.groupSessionIds.map((appointmentId, i) => ({
				purchase_key: traineeId,
				trainee_id: traineeId,
				appointment_id: appointmentId,
				session_number: i + 1,
				total_sessions: plan.groupSessionIds.length
			}))
		);
	}
	return { ...plan, payload: { groupLesson: null, purchases, appointments: [], enrollments } };
}
