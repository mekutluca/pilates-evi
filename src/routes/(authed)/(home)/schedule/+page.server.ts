import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Role } from '$lib/types/Role';
import type { User } from '@supabase/auth-js';
import { getRequiredFormDataString, getFormDataString } from '$lib/utils/form-utils';
import type { DayOfWeek, AppointmentStatus } from '$lib/types/Schedule';

// Helper function to validate user permissions
function validateUserPermission(user: User | null, userRole: Role | null) {
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
	}
	return null;
}

export const load: PageServerLoad = async ({ locals: { supabase, user, userRole }, url }) => {
	const permissionError = validateUserPermission(user, userRole);
	if (permissionError) {
		return {
			appointments: []
		};
	}

	// Get week parameter from URL or default to current week
	const weekParam = url.searchParams.get('week');
	const currentDate = weekParam ? new Date(weekParam) : new Date();

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
	const { data: appointments } = await supabase
		.from('pe_appointments')
		.select(
			`
			*,
			pe_rooms!inner(name),
			pe_trainers!inner(name),
			pe_trainings(name),
			pe_appointment_trainees(
				pe_trainees!inner(name)
			)
		`
		)
		.gte('appointment_date', weekStart.toISOString().split('T')[0])
		.lte('appointment_date', weekEnd.toISOString().split('T')[0])
		.order('appointment_date, hour');

	return {
		appointments: appointments || []
	};
};

export const actions: Actions = {
	createAppointment: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const roomId = Number(getRequiredFormDataString(formData, 'roomId'));
		const trainerId = Number(getRequiredFormDataString(formData, 'trainerId'));
		const dayOfWeek = getRequiredFormDataString(formData, 'dayOfWeek') as DayOfWeek;
		const hour = Number(getRequiredFormDataString(formData, 'hour'));
		const trainingId = Number(getRequiredFormDataString(formData, 'trainingId'));
		const traineeIds = formData.getAll('traineeIds').map((id) => Number(id));
		const notes = getFormDataString(formData, 'notes');
		const weekStart = getFormDataString(formData, 'weekStart'); // Get the current week being viewed

		// Validate inputs
		if (isNaN(roomId) || isNaN(trainerId) || isNaN(hour) || isNaN(trainingId)) {
			return fail(400, { success: false, message: 'Geçersiz form verisi' });
		}

		if (traineeIds.length === 0) {
			return fail(400, { success: false, message: 'En az bir öğrenci seçmelisiniz' });
		}

		if (!weekStart) {
			return fail(400, { success: false, message: 'Hafta bilgisi gereklidir' });
		}

		// Calculate the specific date for this appointment
		const baseDate = new Date(weekStart);
		const dayMapping: Record<DayOfWeek, number> = {
			monday: 1,
			tuesday: 2,
			wednesday: 3,
			thursday: 4,
			friday: 5,
			saturday: 6,
			sunday: 0
		};

		// Calculate the appointment date
		const appointmentDate = new Date(baseDate);
		const currentDay = baseDate.getDay();
		const targetDay = dayMapping[dayOfWeek];
		const daysToAdd = targetDay === 0 ? 7 - currentDay : targetDay - currentDay;
		appointmentDate.setDate(baseDate.getDate() + daysToAdd);

		// Get training recurrence information
		const { data: trainingData, error: trainingError } = await supabase
			.from('pe_trainings')
			.select('recurrence')
			.eq('id', trainingId)
			.single();

		if (trainingError || !trainingData) {
			return fail(500, {
				success: false,
				message: 'Eğitim bilgisi alınırken hata: ' + trainingError?.message
			});
		}

		const recurrence = trainingData.recurrence || 1;

		// Generate a series ID for tracking related sessions
		const seriesId = crypto.randomUUID();

		// Create multiple appointments based on recurrence
		const appointmentsToCreate = [];
		const appointmentTraineesToCreate = [];

		for (let sessionNumber = 1; sessionNumber <= recurrence; sessionNumber++) {
			const currentAppointmentDate = new Date(appointmentDate);
			currentAppointmentDate.setDate(appointmentDate.getDate() + (sessionNumber - 1) * 7);

			// Check if this time slot is already taken
			const { data: existingAppointment } = await supabase
				.from('pe_appointments')
				.select('id')
				.eq('room_id', roomId)
				.eq('appointment_date', currentAppointmentDate.toISOString().split('T')[0])
				.eq('hour', hour)
				.eq('status', 'scheduled')
				.maybeSingle();

			if (existingAppointment) {
				const dateStr = currentAppointmentDate.toLocaleDateString('tr-TR');
				return fail(400, {
					success: false,
					message: `${dateStr} tarihindeki ${hour}:00 zaman dilimi zaten dolu`
				});
			}

			appointmentsToCreate.push({
				room_id: roomId,
				trainer_id: trainerId,
				day_of_week: dayOfWeek,
				hour: hour,
				training_id: trainingId,
				notes: notes || null,
				created_by: user!.id,
				session_number: sessionNumber,
				total_sessions: recurrence,
				series_id: seriesId,
				appointment_date: currentAppointmentDate.toISOString().split('T')[0]
			});
		}

		// Insert all appointments
		const { data: appointmentData, error: appointmentError } = await supabase
			.from('pe_appointments')
			.insert(appointmentsToCreate)
			.select();

		if (appointmentError || !appointmentData) {
			return fail(500, {
				success: false,
				message: 'Randevular oluşturulurken hata: ' + appointmentError?.message
			});
		}

		// Add trainees to all appointments
		for (const appointment of appointmentData) {
			const traineeInserts = traineeIds.map((traineeId) => ({
				appointment_id: appointment.id,
				trainee_id: traineeId
			}));
			appointmentTraineesToCreate.push(...traineeInserts);
		}

		const { error: traineeError } = await supabase
			.from('pe_appointment_trainees')
			.insert(appointmentTraineesToCreate);

		if (traineeError) {
			// Clean up the appointments if trainee insertion fails
			await supabase
				.from('pe_appointments')
				.delete()
				.in(
					'id',
					appointmentData.map((apt) => apt.id)
				);
			return fail(500, {
				success: false,
				message: 'Öğrenciler eklenirken hata: ' + traineeError.message
			});
		}

		const sessionText =
			recurrence === 1 ? '1 randevu' : `${recurrence} haftalık kurs (${recurrence} randevu)`;
		return { success: true, message: `${sessionText} başarıyla oluşturuldu` };
	},

	rescheduleAppointment: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const appointmentId = Number(getRequiredFormDataString(formData, 'appointmentId'));
		const newRoomId = Number(getRequiredFormDataString(formData, 'newRoomId'));
		const newDayOfWeek = getRequiredFormDataString(formData, 'newDayOfWeek') as DayOfWeek;
		const newHour = Number(getRequiredFormDataString(formData, 'newHour'));
		const reason = getFormDataString(formData, 'reason');

		// Validate inputs
		if (isNaN(appointmentId) || isNaN(newRoomId) || isNaN(newHour)) {
			return fail(400, { success: false, message: 'Geçersiz form verisi' });
		}

		// Get current appointment details
		const { data: currentAppointment, error: fetchError } = await supabase
			.from('pe_appointments')
			.select('*')
			.eq('id', appointmentId)
			.single();

		if (fetchError || !currentAppointment) {
			return fail(404, { success: false, message: 'Randevu bulunamadı' });
		}

		// Check coordinator permissions if not admin
		if (userRole === 'coordinator') {
			// Get reschedule count for current month
			const { data: rescheduleCount } = await supabase.rpc('get_coordinator_reschedule_count', {
				user_id: user!.id
			});

			if (rescheduleCount >= 2) {
				return fail(400, {
					success: false,
					message: 'Bu ay en fazla 2 randevu değiştirebilirsiniz'
				});
			}

			// Check 23-hour rule
			const now = new Date();
			const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
			const currentHour = now.getHours();

			// Convert DayOfWeek to number (Monday = 1, Sunday = 0)
			const dayMapping: Record<DayOfWeek, number> = {
				monday: 1,
				tuesday: 2,
				wednesday: 3,
				thursday: 4,
				friday: 5,
				saturday: 6,
				sunday: 0
			};
			const appointmentDayNum = dayMapping[currentAppointment.day_of_week as DayOfWeek];

			// Calculate hours until appointment
			let daysUntil = appointmentDayNum - currentDay;
			if (daysUntil < 0) daysUntil += 7; // Next week

			const hoursUntil = daysUntil * 24 + (currentAppointment.hour - currentHour);

			if (hoursUntil < 23) {
				return fail(400, {
					success: false,
					message: 'Randevu değişikliği en az 23 saat önceden yapılmalıdır'
				});
			}
		}

		// Check if new time slot is available
		const { data: conflictingAppointment } = await supabase
			.from('pe_appointments')
			.select('id')
			.eq('room_id', newRoomId)
			.eq('day_of_week', newDayOfWeek)
			.eq('hour', newHour)
			.eq('status', 'scheduled')
			.neq('id', appointmentId)
			.single();

		if (conflictingAppointment) {
			return fail(400, { success: false, message: 'Yeni zaman dilimi zaten dolu' });
		}

		// No room availability check needed - all time slots are available

		// Update appointment
		const { error: updateError } = await supabase
			.from('pe_appointments')
			.update({
				room_id: newRoomId,
				day_of_week: newDayOfWeek,
				hour: newHour
			})
			.eq('id', appointmentId);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Randevu güncellenirken hata: ' + updateError.message
			});
		}

		// Log reschedule history
		const { error: historyError } = await supabase.from('pe_reschedule_history').insert({
			appointment_id: appointmentId,
			old_room_id: currentAppointment.room_id,
			old_day_of_week: currentAppointment.day_of_week,
			old_hour: currentAppointment.hour,
			new_room_id: newRoomId,
			new_day_of_week: newDayOfWeek,
			new_hour: newHour,
			rescheduled_by: user!.id,
			reason: reason || null
		});

		if (historyError) {
			console.error('Error logging reschedule history:', historyError);
		}

		return { success: true, message: 'Randevu başarıyla yeniden planlandı' };
	},

	updateAppointmentStatus: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const appointmentId = Number(getRequiredFormDataString(formData, 'appointmentId'));
		const status = getRequiredFormDataString(formData, 'status') as AppointmentStatus;

		if (isNaN(appointmentId)) {
			return fail(400, { success: false, message: 'Geçersiz randevu ID' });
		}

		const { error: updateError } = await supabase
			.from('pe_appointments')
			.update({ status })
			.eq('id', appointmentId);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Randevu durumu güncellenirken hata: ' + updateError.message
			});
		}

		return { success: true, message: 'Randevu durumu başarıyla güncellendi' };
	}
};
