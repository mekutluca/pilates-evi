import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getRequiredFormDataString } from '$lib/utils/form-utils';
import {
	formatShortTurkishDateTime,
	formatDateForDB,
	getAppointmentDateTime,
	isAppointmentFuture
} from '$lib/utils/date-utils';
import type { CancelTraineeAction } from '$lib/types/Schedule';
import { cancelAppointment } from '$lib/utils/cancellation-utils';
import { getWhatsAppRepository } from '$lib/whatsapp';
import { ConflictService } from '$lib/server/services/conflict-service';
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

	// Get week parameter from URL or default to current week
	const weekParam = url.searchParams.get('week');
	let currentDate = weekParam ? new Date(weekParam) : new Date();

	// If the date is invalid (e.g., from cleared date picker), default to current date
	if (isNaN(currentDate.getTime())) {
		currentDate = new Date();
	}

	// Calculate start and end of the week (Monday to Sunday)
	const weekStart = new Date(currentDate);
	const day = weekStart.getDay();
	const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
	weekStart.setDate(diff);
	weekStart.setHours(0, 0, 0, 0);

	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekStart.getDate() + 6);
	weekEnd.setHours(23, 59, 59, 999);

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
		const newAppointmentDateString = getRequiredFormDataString(formData, 'newDate');
		const newHour = Number(getRequiredFormDataString(formData, 'newHour'));
		const source = (formData.get('source')?.toString() || 'trainee') as 'trainee' | 'system';
		const reason = formData.get('reason')?.toString() || '';

		// Validate inputs
		if (
			isNaN(appointmentId) ||
			!Number.isInteger(newHour) ||
			newHour < 0 ||
			newHour > 23 ||
			!/^\d{4}-\d{2}-\d{2}$/.test(newAppointmentDateString)
		) {
			return fail(400, { success: false, message: 'Geçersiz form verisi' });
		}

		if (source === 'system' && !reason.trim()) {
			return fail(400, {
				success: false,
				message: 'Sistem kaynaklı değişiklikler için sebep belirtilmesi gerekir'
			});
		}

		// Get current appointment details with purchase info, package name, and trainees
		const { data: currentAppointment, error: fetchError } = await supabase
			.from('pe_appointments')
			.select(
				`
				*,
				pe_purchases(
					id,
					reschedule_left,
					pe_packages(name)
				),
				pe_group_lessons(
					pe_packages(name)
				),
				pe_appointment_trainees(
					pe_trainees(phone)
				)
			`
			)
			.eq('id', appointmentId)
			.single();

		if (fetchError || !currentAppointment) {
			return fail(404, { success: false, message: 'Randevu bulunamadı' });
		}

		const hoursUntil =
			(getAppointmentDateTime(currentAppointment.date, currentAppointment.hour).getTime() -
				Date.now()) /
			(1000 * 60 * 60);

		// Rule 1: Past appointments are never reschedulable, nor can anything move into the past
		if (hoursUntil < 0) {
			return fail(400, {
				success: false,
				message: 'Başlamış olan randevuların vakti değiştirilemez'
			});
		}
		if (!isAppointmentFuture(newAppointmentDateString, newHour)) {
			return fail(400, { success: false, message: 'Randevu geçmiş bir saate taşınamaz' });
		}

		// Rule 2: Admins reschedule any future appointment without spending a credit.
		// Rule 3: Coordinators need a purchase with credits left and 23+ hours of notice.
		const purchase = currentAppointment.pe_purchases;
		const consumeCredit = userRole !== 'admin';
		if (consumeCredit) {
			if (!purchase || purchase.reschedule_left <= 0) {
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

		// Check if new time slot is available — the room and the appointment's
		// trainer must both be free
		const { roomConflict, trainerConflict } = await new ConflictService(
			supabase
		).checkAppointmentSlot({
			date: newAppointmentDateString,
			hour: newHour,
			roomId: newRoomId,
			trainerId: currentAppointment.trainer_id,
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

		// Spend the credit and move the appointment in one transaction (999 = unlimited,
		// never decremented — handled inside the RPC)
		const { error: rescheduleError } = await supabase.rpc('pe_reschedule_appointment', {
			p_appointment_id: appointmentId,
			p_date: newAppointmentDateString,
			p_hour: newHour,
			p_room_id: newRoomId,
			p_consume_credit: consumeCredit
		});

		if (rescheduleError) {
			return fail(400, { success: false, message: rescheduleError.message });
		}

		// Send WhatsApp reschedule notification
		const appointmentTrainees = currentAppointment.pe_appointment_trainees as
			Array<{ pe_trainees: { phone: string } | null }> | undefined;
		const trainees = (appointmentTrainees ?? [])
			.map((at) => at.pe_trainees)
			.filter((t): t is { phone: string } => t !== null && !!t.phone);

		let notifiedCount = 0;
		if (trainees.length > 0) {
			const packageName =
				currentAppointment.pe_purchases?.pe_packages?.name ??
				currentAppointment.pe_group_lessons?.pe_packages?.name ??
				'';

			const oldDateTime = formatShortTurkishDateTime(
				currentAppointment.date,
				currentAppointment.hour
			);
			const newDateTime = formatShortTurkishDateTime(newAppointmentDateString, newHour);

			const whatsapp = getWhatsAppRepository();
			notifiedCount = await whatsapp.sendRescheduleNotifications({
				trainees,
				oldDateTime,
				newDateTime,
				packageName,
				templateName:
					source === 'system' ? 'appt_reschedule_by_system' : 'appt_reschedule_per_user_request',
				cause: source === 'system' ? reason : undefined
			});
		}

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

		const { error } = await cancelAppointment(supabase, appointmentId, traineeAction);
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
