import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { MoveOutcome, SeriesAppointment, TransferScope } from '$lib/types/Transfer';
import { getRequiredFormDataString } from '$lib/utils/form-utils';
import { isAppointmentFuture } from '$lib/utils/date-utils';
import { AppointmentRepository } from '$lib/server/repositories/appointment-repository';
import { SchedulingService } from '$lib/server/services/scheduling-service';
import { NotificationService } from '$lib/server/services/notification-service';
import { getGroupLessonCanonicalSlots } from '$lib/server/scheduling/extension';
import { buildTraineeEligibleByGroup } from '$lib/server/scheduling/shift';
import { requireStaff } from '$lib/server/permissions';

const SCOPES: TransferScope[] = ['single', 'from_selected', 'all_from_now'];

function parseScope(formData: FormData): TransferScope | null {
	const scope = formData.get('scope')?.toString();
	return SCOPES.find((s) => s === scope) ?? null;
}

function toPreviewRow(a: SeriesAppointment) {
	return {
		id: a.id,
		date: a.date,
		hour: a.hour,
		group_lesson_id: a.group_lesson_id,
		room_name: a.pe_rooms.name,
		trainer_name: a.pe_trainers.name
	};
}

// The week the change landed in, so the schedule opens on it instead of today's week
function scheduleUrl(date: string | undefined): string {
	return date ? `/schedule?week=${date}` : '/schedule';
}

function conflictFailure(outcome: MoveOutcome) {
	return fail(400, {
		success: false,
		message: `${outcome.conflicts.length} çakışma tespit edildi. Lütfen önce çakışmaları kontrol edin.`,
		conflicts: outcome.conflicts
	});
}

// Studio-initiated shifts tell trainees only when a cause was given
async function notifyShift(outcome: MoveOutcome, cause: string): Promise<string> {
	if (!cause) return '';
	const sent = await new NotificationService().notify(
		NotificationService.changesFromMoves(outcome.moved),
		{ kind: 'system', cause }
	);
	return sent > 0 ? ` ${sent} öğrenciye bilgilendirme mesajı gönderildi.` : '';
}

export const load: PageServerLoad = async ({
	url,
	locals: { supabase, user, userRole },
	parent
}) => {
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	const appointmentId = Number(url.searchParams.get('appointment_id'));
	if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
		throw error(400, 'Randevu ID gerekli');
	}
	const traineeId = url.searchParams.get('trainee_id') || null;

	const repository = new AppointmentRepository(supabase);
	const appointment = await repository.getById(appointmentId);
	if (!appointment) {
		throw error(404, 'Randevu bulunamadı');
	}
	if (!isAppointmentFuture(appointment.date, appointment.hour)) {
		throw error(400, 'Geçmiş randevular değiştirilemez');
	}

	const traineeEnrollment = traineeId
		? appointment.pe_appointment_trainees.find((e) => e.trainee_id === traineeId)
		: undefined;
	if (traineeId && !traineeEnrollment) {
		throw error(404, 'Öğrenci kaydı bulunamadı');
	}

	const [{ rooms, trainers }, futureAppointments, allFromNowAppointments] = await Promise.all([
		parent(),
		repository.getSeries(appointmentId, 'from_selected', traineeId),
		repository.getSeries(appointmentId, 'all_from_now', traineeId)
	]);

	const canonicalTimeslots = appointment.group_lesson_id
		? (await getGroupLessonCanonicalSlots(supabase, appointment.group_lesson_id)).slots
		: [];

	// Trainee slot-shift previews walk the trainee's own pattern in each of their group
	// lessons, not the group's full canonical pattern
	const slotShiftEligibleByGroup = traineeId
		? Object.fromEntries(
				await buildTraineeEligibleByGroup(
					supabase,
					allFromNowAppointments.flatMap((a) =>
						a.group_lesson_id
							? [{ groupLessonId: a.group_lesson_id, date: a.date, hour: a.hour }]
							: []
					),
					appointment.date
				)
			)
		: {};

	return {
		appointment,
		rooms: rooms.filter((r) => r.is_active),
		trainers: trainers.filter((t) => t.is_active),
		traineeInfo: traineeEnrollment
			? { id: traineeEnrollment.trainee_id, name: traineeEnrollment.pe_trainees.name }
			: null,
		futureAppointments: futureAppointments.map(toPreviewRow),
		futureAppointmentCount: futureAppointments.length,
		allFromNowAppointments: allFromNowAppointments.map(toPreviewRow),
		allFromNowCount: allFromNowAppointments.length,
		canonicalTimeslots,
		slotShiftEligibleByGroup
	};
};

export const actions: Actions = {
	transfer: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const scope = parseScope(formData);
		if (!scope) return fail(400, { success: false, message: 'Geçersiz kapsam' });

		const outcome = await new SchedulingService(supabase).transferResources({
			appointmentId: Number(getRequiredFormDataString(formData, 'appointment_id')),
			scope,
			roomId: formData.get('new_room_id')?.toString() || undefined,
			trainerId: formData.get('new_trainer_id')?.toString() || undefined
		});
		if (outcome.error) return fail(400, { success: false, message: outcome.error });
		if (outcome.conflicts.length > 0) return conflictFailure(outcome);

		return {
			success: true,
			message: `${outcome.moved.length} randevu aktarıldı.`,
			redirectTo: scheduleUrl(outcome.moved[0]?.newDate)
		};
	},

	shift_by_time: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const scope = parseScope(formData);
		if (!scope) return fail(400, { success: false, message: 'Geçersiz kapsam' });

		const outcome = await new SchedulingService(supabase).shiftSeriesByWeeks({
			appointmentId: Number(getRequiredFormDataString(formData, 'appointment_id')),
			scope,
			weeks: Number(getRequiredFormDataString(formData, 'weeks'))
		});
		if (outcome.error) return fail(400, { success: false, message: outcome.error });
		if (outcome.conflicts.length > 0) return conflictFailure(outcome);

		const notified = await notifyShift(outcome, formData.get('cause')?.toString() ?? '');
		return {
			success: true,
			message: `${outcome.moved.length} randevu kaydırıldı.${notified}`,
			redirectTo: scheduleUrl(outcome.moved[0]?.newDate)
		};
	},

	shift_by_slot: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const outcome = await new SchedulingService(supabase).shiftSeriesBySlots(
			Number(getRequiredFormDataString(formData, 'appointment_id')),
			Number(getRequiredFormDataString(formData, 'slots'))
		);
		if (outcome.error) return fail(400, { success: false, message: outcome.error });
		if (outcome.conflicts.length > 0) return conflictFailure(outcome);

		const notified = await notifyShift(outcome, formData.get('cause')?.toString() ?? '');
		return {
			success: true,
			message: `${outcome.moved.length} randevu kaydırıldı.${notified}`,
			redirectTo: scheduleUrl(outcome.moved[0]?.newDate)
		};
	},

	shift_trainee_by_time: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const result = await new SchedulingService(supabase).shiftTraineeByWeeks(
			Number(getRequiredFormDataString(formData, 'appointment_id')),
			getRequiredFormDataString(formData, 'trainee_id'),
			Number(getRequiredFormDataString(formData, 'weeks'))
		);
		if (result.error) return fail(400, { success: false, message: result.error });

		const skipped =
			result.skippedCount > 0 ? ` ${result.skippedCount} randevu iptal edildiği için atlandı.` : '';
		return {
			success: true,
			message: `${result.shifted.length} ders kaydırıldı.${skipped}`,
			redirectTo: '/schedule'
		};
	},

	shift_trainee_by_slot: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const result = await new SchedulingService(supabase).shiftTraineeBySlots(
			Number(getRequiredFormDataString(formData, 'appointment_id')),
			getRequiredFormDataString(formData, 'trainee_id'),
			Number(getRequiredFormDataString(formData, 'slots'))
		);
		if (result.error) return fail(400, { success: false, message: result.error });

		return {
			success: true,
			message: `${result.shifted.length} ders kaydırıldı.`,
			redirectTo: '/schedule'
		};
	}
};
