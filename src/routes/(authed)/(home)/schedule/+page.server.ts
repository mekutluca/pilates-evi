import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getRequiredFormDataString } from '$lib/utils/form-utils';
import {
	formatDateForDB,
	getAppointmentDateTime,
	getWeekEnd,
	getWeekStart,
	isAppointmentFuture,
	parseLocalDate
} from '$lib/utils/date-utils';
import type { CancelTraineeAction } from '$lib/types/Schedule';
import { AppointmentRepository } from '$lib/server/repositories/appointment-repository';
import { ConflictService } from '$lib/server/services/conflict-service';
import { NotificationService } from '$lib/server/services/notification-service';
import { SchedulingService } from '$lib/server/services/scheduling-service';
import { requireStaff } from '$lib/server/permissions';

export const load: PageServerLoad = async ({
	locals: { supabase, user, userRole },
	url,
	parent
}) => {
	const permissionError = requireStaff(user, userRole);
	if (permissionError) {
		return {
			appointments: [],
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
		weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? parseLocalDate(weekParam) : new Date()
	);
	const weekEnd = getWeekEnd(weekStart);

	// Fetch appointments for the current week
	const { data: appointments, error: appointmentsError } = await supabase
		.from('pe_appointments')
		.select(
			`
			*,
			pe_rooms(id, name),
			pe_trainers(id, name),
			pe_purchases(
				id,
				reschedule_left,
				successor_id,
				pe_packages(id, name, package_type, weeks_duration, min_lessons_per_week, max_lessons_per_week, max_capacity)
			),
			pe_group_lessons(
				id,
				pe_packages(id, name, package_type, max_capacity)
			),
			pe_appointment_trainees(
				id,
				session_number,
				total_sessions,
				purchase_id,
				pe_trainees(id, name),
				pe_purchases(successor_id)
			)
		`
		)
		.gte('date', formatDateForDB(weekStart))
		.lte('date', formatDateForDB(weekEnd))
		.order('date, hour');

	if (appointmentsError) {
		console.error('Error fetching appointments:', appointmentsError);
	}

	return {
		appointments: appointments || [],
		rooms: activeRooms,
		trainers: activeTrainers
	};
};

export const actions: Actions = {
	rescheduleAppointment: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = requireStaff(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const appointmentId = Number(getRequiredFormDataString(formData, 'appointmentId'));
		const newRoomId = getRequiredFormDataString(formData, 'newRoomId');
		const newDate = getRequiredFormDataString(formData, 'newDate');
		const newHour = Number(getRequiredFormDataString(formData, 'newHour'));
		const source = (formData.get('source')?.toString() || 'trainee') as 'trainee' | 'system';
		const reason = formData.get('reason')?.toString() || '';

		// Validate inputs
		if (
			isNaN(appointmentId) ||
			!Number.isInteger(newHour) ||
			newHour < 0 ||
			newHour > 23 ||
			!/^\d{4}-\d{2}-\d{2}$/.test(newDate)
		) {
			return fail(400, { success: false, message: 'Geçersiz form verisi' });
		}

		if (source === 'system' && !reason.trim()) {
			return fail(400, {
				success: false,
				message: 'Sistem kaynaklı değişiklikler için sebep belirtilmesi gerekir'
			});
		}

		const appointment = await new AppointmentRepository(supabase).getById(appointmentId);
		if (!appointment) {
			return fail(404, { success: false, message: 'Randevu bulunamadı' });
		}

		const hoursUntil =
			(getAppointmentDateTime(appointment.date, appointment.hour).getTime() - Date.now()) /
			(1000 * 60 * 60);

		// Rule 1: Past appointments are never reschedulable, nor can anything move into the past
		if (hoursUntil < 0) {
			return fail(400, {
				success: false,
				message: 'Başlamış olan randevuların vakti değiştirilemez'
			});
		}
		if (!isAppointmentFuture(newDate, newHour)) {
			return fail(400, { success: false, message: 'Randevu geçmiş bir saate taşınamaz' });
		}

		// Rule 2: Admins reschedule any future appointment without spending a credit.
		// Rule 3: Coordinators need a purchase with credits left and 23+ hours of notice.
		const consumeCredit = userRole !== 'admin';
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
					message: 'Randevu değişikliği en az 23 saat önceden yapılmalıdır'
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

		const notifiedCount = await new NotificationService().notify(
			NotificationService.changesFromMoves([{ appointment, newDate, newHour }]),
			source === 'system' ? { kind: 'system', cause: reason } : { kind: 'trainee_request' }
		);

		const message =
			notifiedCount > 0
				? `Randevu vakti başarıyla değiştirildi. ${notifiedCount} öğrenciye bilgilendirme mesajı gönderildi.`
				: 'Randevu vakti başarıyla değiştirildi';

		return { success: true, message };
	},

	cancelAppointment: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = requireStaff(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();
		const appointmentId = Number(getRequiredFormDataString(formData, 'appointmentId'));

		if (isNaN(appointmentId)) {
			return fail(400, { success: false, message: 'Geçersiz form verisi' });
		}

		const rawTraineeAction = formData.get('traineeAction')?.toString();
		const traineeAction: CancelTraineeAction | null =
			rawTraineeAction === 'shift' || rawTraineeAction === 'remove' ? rawTraineeAction : null;

		const { error } = await new SchedulingService(supabase).cancelAppointment(
			appointmentId,
			traineeAction
		);
		if (error) {
			return fail(400, { success: false, message: error });
		}

		const message =
			traineeAction === 'shift'
				? 'Randevu iptal edildi ve öğrenci dersleri kaydırıldı'
				: 'Randevu başarıyla iptal edildi';
		return { success: true, message };
	}
};
