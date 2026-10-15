import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getFormDataString, getRequiredFormDataString } from '$lib/utils/form-utils';
import {
	formatDateForDB,
	getAppointmentDateTime,
	getWeekStart,
	isAppointmentFuture,
	parseLocalDate
} from '$lib/utils/date-utils';
import type { CancelTraineeAction } from '$lib/types/Schedule';
import type { MoveReason } from '$lib/types/Transfer';
import type { ScheduleChangeMessage } from '$lib/types/WhatsApp';
import { AppointmentRepository } from '$lib/server/repositories/appointment-repository';
import { orNull } from '$lib/server/streaming';
import { ConflictService } from '$lib/server/services/conflict-service';
import { NotificationService } from '$lib/server/services/notification-service';
import { SchedulingService } from '$lib/server/services/scheduling-service';
import { requireStaff } from '$lib/server/permissions';
import {
	notifiedSuffix,
	parseMoveReason,
	parseMoveRequest,
	wantsNotification
} from '$lib/server/scheduling/move-form';
import { isIsoDate } from '$lib/utils/validation';

export const load: PageServerLoad = async ({
	locals: { supabase, user, userRole },
	url,
	parent
}) => {
	const permissionError = requireStaff(user, userRole);
	if (permissionError) {
		return {
			appointments: Promise.resolve([]),
			rooms: [],
			trainers: []
		};
	}

	const { rooms, trainers } = await parent();
	const activeRooms = rooms.filter((r) => r.is_active);
	const activeTrainers = trainers.filter((t) => t.is_active);

	// Week from the URL (any day of it), defaulting to the current week
	const weekParam = url.searchParams.get('week');
	const weekStart = getWeekStart(
		weekParam && isIsoDate(weekParam) ? parseLocalDate(weekParam) : new Date()
	);

	return {
		// Streamed: the page shows the board skeleton until the week arrives; null if it failed
		appointments: orNull(new AppointmentRepository(supabase).getWeek(weekStart), 'week'),
		rooms: activeRooms,
		trainers: activeTrainers
	};
};

function changeMessage(reason: MoveReason): ScheduleChangeMessage {
	return reason.source === 'studio'
		? { kind: 'system', cause: reason.cause }
		: { kind: 'trainee_request' };
}

export const actions: Actions = {
	rescheduleAppointment: async ({
		request,
		locals: { supabase, user, userRole, organizationId }
	}) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const appointmentId = Number(getRequiredFormDataString(formData, 'appointmentId'));
		const newRoomId = getRequiredFormDataString(formData, 'newRoomId');
		const newDate = getRequiredFormDataString(formData, 'newDate');
		const newHour = Number(getRequiredFormDataString(formData, 'newHour'));
		if (
			isNaN(appointmentId) ||
			!Number.isInteger(newHour) ||
			newHour < 0 ||
			newHour > 23 ||
			!isIsoDate(newDate)
		) {
			return fail(400, {
				success: false,
				message: 'Formda eksik bilgi var. Sayfayı yenileyip tekrar deneyin.'
			});
		}

		const reason = parseMoveReason(formData);
		if (typeof reason === 'string') return fail(400, { success: false, message: reason });

		const appointment = await new AppointmentRepository(supabase).getById(appointmentId);
		if (!appointment) {
			return fail(404, { success: false, message: 'Randevu bulunamadı' });
		}

		const hoursUntil =
			(getAppointmentDateTime(appointment.date, appointment.hour).getTime() - Date.now()) /
			(1000 * 60 * 60);

		// Past lessons never move, nor can anything move into the past
		if (hoursUntil < 0) {
			return fail(400, {
				success: false,
				message: 'Başlamış randevu taşınamaz'
			});
		}
		if (!isAppointmentFuture(newDate, newHour)) {
			return fail(400, { success: false, message: 'Randevu geçmiş bir saate taşınamaz' });
		}

		// A client's own request costs a coordinator one of the package's reschedule
		// credits and needs 23 hours' notice; studio-caused moves and admins are free
		const consumeCredit = userRole !== 'admin' && reason.source === 'trainee';
		if (consumeCredit) {
			if (!appointment.pe_purchases || appointment.pe_purchases.reschedule_left <= 0) {
				return fail(400, {
					success: false,
					message: 'Bu kayıt için randevu değiştirme hakkı kalmamış'
				});
			}
			if (hoursUntil < 23) {
				return fail(400, {
					success: false,
					message: 'Öğrenci talebiyle değişiklik en az 23 saat önceden yapılabilir'
				});
			}
		}

		// The room and the appointment's trainer must both be free
		const { roomConflict, trainerConflict } = await new ConflictService(
			supabase
		).checkAppointmentSlot({
			date: newDate,
			hour: newHour,
			roomId: newRoomId,
			trainerId: appointment.trainer_id,
			excludeAppointmentId: appointmentId
		});
		if (roomConflict || trainerConflict) {
			return fail(400, {
				success: false,
				message: roomConflict
					? 'Yeni zaman dilimi zaten dolu'
					: 'Eğitmenin bu saatte başka bir randevusu var'
			});
		}

		const rescheduleError = await new SchedulingService(supabase).reschedule({
			appointmentId,
			date: newDate,
			hour: newHour,
			roomId: newRoomId,
			consumeCredit
		});
		if (rescheduleError) {
			return fail(400, { success: false, message: rescheduleError });
		}

		const notified = wantsNotification(formData)
			? await (
					await NotificationService.forStudio(supabase, organizationId)
				).notify(
					NotificationService.changesFromMoves([{ appointment, newDate, newHour }]),
					changeMessage(reason)
				)
			: null;

		return {
			success: true,
			message: `Randevu taşındı.${notifiedSuffix(notified)}`,
			week: newDate
		};
	},

	cancelAppointment: async ({ request, locals: { supabase, user, userRole, organizationId } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const appointmentId = Number(getRequiredFormDataString(formData, 'appointmentId'));
		if (isNaN(appointmentId)) {
			return fail(400, {
				success: false,
				message: 'Formda eksik bilgi var. Sayfayı yenileyip tekrar deneyin.'
			});
		}

		const rawTraineeAction = getFormDataString(formData, 'traineeAction');
		const traineeAction: CancelTraineeAction | null =
			rawTraineeAction === 'shift' || rawTraineeAction === 'remove' ? rawTraineeAction : null;

		const { error, changes } = await new SchedulingService(supabase).cancelAppointment(
			appointmentId,
			traineeAction
		);
		if (error) {
			return fail(400, { success: false, message: error });
		}

		const cause = getFormDataString(formData, 'cause').trim();
		const notified =
			wantsNotification(formData) && cause
				? await (
						await NotificationService.forStudio(supabase, organizationId)
					).notify(changes, { kind: 'system', cause })
				: null;

		return {
			success: true,
			message:
				(traineeAction === 'shift'
					? 'Randevu iptal edildi, dersler bir sonraki randevuya kaydırıldı.'
					: 'Randevu iptal edildi.') + notifiedSuffix(notified)
		};
	},

	previewMove: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const move = parseMoveRequest(await request.formData());
		if (typeof move === 'string') return fail(400, { success: false, message: move });

		const result = await new SchedulingService(supabase).move(move, true);
		if (result.error) return fail(400, { success: false, message: result.error });

		return {
			success: true,
			rows: result.rows,
			conflicts: result.conflicts,
			recipientCount: new Set(result.changes.map((c) => c.phone)).size
		};
	},

	move: async ({ request, locals: { supabase, user, userRole, organizationId } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const move = parseMoveRequest(formData);
		if (typeof move === 'string') return fail(400, { success: false, message: move });
		const reason = parseMoveReason(formData);
		if (typeof reason === 'string') return fail(400, { success: false, message: reason });

		const result = await new SchedulingService(supabase).move(move, false);
		if (result.error) return fail(400, { success: false, message: result.error });
		if (result.conflicts.length > 0) {
			return fail(400, {
				success: false,
				message: `${result.conflicts.length} çakışma var, taşıma yapılmadı.`
			});
		}

		const notified = wantsNotification(formData)
			? await (
					await NotificationService.forStudio(supabase, organizationId)
				).notify(result.changes, changeMessage(reason))
			: null;
		const skipped =
			result.skippedCount > 0 ? ` ${result.skippedCount} randevu iptal edildiği için atlandı.` : '';

		return {
			success: true,
			message: `${result.rows.length} randevu taşındı.${skipped}${notifiedSuffix(notified)}`,
			week: result.rows[0]?.to.date
		};
	},

	previewCloseDay: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const date = getRequiredFormDataString(await request.formData(), 'date');
		if (!isIsoDate(date) || date <= formatDateForDB(new Date())) {
			return fail(400, { success: false, message: 'Sadece yarın ve sonrası kapatılabilir' });
		}
		return { success: true, preview: await new SchedulingService(supabase).previewCloseDay(date) };
	},

	closeDay: async ({ request, locals: { supabase, user, userRole, organizationId } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const date = getRequiredFormDataString(formData, 'date');
		const cause = getRequiredFormDataString(formData, 'cause');
		if (!isIsoDate(date) || date <= formatDateForDB(new Date())) {
			return fail(400, { success: false, message: 'Sadece yarın ve sonrası kapatılabilir' });
		}

		// A resolution pass restricts the run to the previously conflicting appointments
		const idsRaw = getFormDataString(formData, 'appointmentIds');
		const result = await new SchedulingService(supabase).closeDay({
			date,
			appointmentIds: idsRaw
				? idsRaw
						.split(',')
						.map(Number)
						.filter((n) => Number.isFinite(n))
				: undefined,
			strategy: getFormDataString(formData, 'strategy') === 'closest' ? 'closest' : 'shift'
		});
		if (result.error) return fail(400, { success: false, message: result.error });

		const notified = wantsNotification(formData)
			? await (
					await NotificationService.forStudio(supabase, organizationId)
				).notify(result.notifications, { kind: 'system', cause })
			: null;

		const parts: string[] = [];
		if (result.shiftedCount > 0) parts.push(`${result.shiftedCount} randevu kaydırıldı`);
		if (result.deletedCount > 0) parts.push(`${result.deletedCount} boş randevu silindi`);
		if (result.conflicts.length > 0) {
			parts.push(`${result.conflicts.length} randevu çakışma nedeniyle kaydırılamadı`);
		}

		return {
			success: true,
			message:
				(parts.length > 0 ? `${parts.join(', ')}.` : 'Gün kapatıldı.') + notifiedSuffix(notified),
			conflicts: result.conflicts,
			warnings: result.warnings
		};
	}
};
