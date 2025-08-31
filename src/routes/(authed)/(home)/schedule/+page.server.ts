import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Role } from '$lib/types/Role';
import type { User } from '@supabase/auth-js';
import { getRequiredFormDataString } from '$lib/utils/form-utils';
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
			pe_packages(name, reschedulable),
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
	rescheduleAppointment: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const appointmentId = Number(getRequiredFormDataString(formData, 'appointmentId'));
		const newRoomId = Number(getRequiredFormDataString(formData, 'newRoomId'));
		const newDayOfWeek = getRequiredFormDataString(formData, 'newDayOfWeek') as DayOfWeek;
		const newHour = Number(getRequiredFormDataString(formData, 'newHour'));
		// Note: reason field removed since reschedule history is now handled at package level

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

		// This check will be performed later with role-specific logic

		// First check if the package allows rescheduling
		if (currentAppointment.package_id) {
			const { data: packageData } = await supabase
				.from('pe_packages')
				.select('reschedulable')
				.eq('id', currentAppointment.package_id)
				.single();

			if (packageData && !packageData.reschedulable) {
				return fail(400, {
					success: false,
					message: 'Bu ders türü için randevu değişikliği yapılamaz'
				});
			}
		}

		// Check role-based time constraints for rescheduling
		const now = new Date();
		const appointmentDateTime = new Date(
			currentAppointment.appointment_date +
				'T' +
				String(currentAppointment.hour).padStart(2, '0') +
				':00:00'
		);
		const millisecondsUntil = appointmentDateTime.getTime() - now.getTime();
		const hoursUntil = millisecondsUntil / (1000 * 60 * 60);

		if (userRole === 'coordinator') {
			// Coordinators need 23 hours advance notice
			if (hoursUntil < 23) {
				return fail(400, {
					success: false,
					message: 'Randevu değişikliği en az 23 saat önceden yapılmalıdır'
				});
			}
		} else if (userRole === 'admin') {
			// Admins can reschedule until the appointment starts (but not after)
			if (hoursUntil < 0) {
				return fail(400, {
					success: false,
					message: 'Başlamış olan randevular ertelenemez'
				});
			}
		}

		// Calculate the new appointment date based on the current appointment's week and new day of week
		const currentAppointmentDate = new Date(currentAppointment.appointment_date);

		// Calculate week start for the current appointment
		const weekStart = new Date(currentAppointmentDate);
		const day = weekStart.getDay();
		const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
		weekStart.setDate(diff);

		// Calculate the new appointment date based on the new day of week within the same week
		const dayMapping: Record<DayOfWeek, number> = {
			monday: 1,
			tuesday: 2,
			wednesday: 3,
			thursday: 4,
			friday: 5,
			saturday: 6,
			sunday: 0
		};

		const newDayNum = dayMapping[newDayOfWeek];
		const newAppointmentDate = new Date(weekStart);
		const daysToAdd = newDayNum === 0 ? 6 : newDayNum - 1; // Sunday is 6 days from Monday
		newAppointmentDate.setDate(weekStart.getDate() + daysToAdd);

		const newAppointmentDateString = newAppointmentDate.toISOString().split('T')[0];

		// Check if new time slot is available
		const { data: conflictingAppointment } = await supabase
			.from('pe_appointments')
			.select('id')
			.eq('room_id', newRoomId)
			.eq('appointment_date', newAppointmentDateString)
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
				hour: newHour,
				appointment_date: newAppointmentDateString
			})
			.eq('id', appointmentId);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Randevu güncellenirken hata: ' + updateError.message
			});
		}

		// Note: Reschedule history is now handled at package level

		return { success: true, message: 'Randevu başarıyla ertelendi' };
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
