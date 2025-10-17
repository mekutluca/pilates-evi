import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Role } from '$lib/types/Role';
import type { User } from '@supabase/auth-js';
import { getRequiredFormDataString } from '$lib/utils/form-utils';
import type { DayOfWeek } from '$lib/types/Schedule';

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
				pe_packages(id, name, package_type, weeks_duration, lessons_per_week)
			),
			pe_group_lessons(
				id,
				pe_packages(id, name, package_type)
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
		.gte('date', weekStart.toISOString().split('T')[0])
		.lte('date', weekEnd.toISOString().split('T')[0])
		.order('date, hour');

	if (appointmentsError) {
		console.error('Error fetching appointments:', appointmentsError);
	}

	// Also fetch all appointments for conflict checking during extensions
	const { data: allAppointments, error: allAppointmentsError } = await supabase
		.from('pe_appointments')
		.select(
			`
			*,
			pe_rooms(id),
			pe_trainers(id)
		`
		)
		.order('date, hour');

	if (allAppointmentsError) {
		console.error('Error fetching all appointments:', allAppointmentsError);
	}

	return {
		appointments: appointments || [],
		allAppointments: allAppointments || []
	};
};

export const actions: Actions = {
	rescheduleAppointment: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const appointmentId = Number(getRequiredFormDataString(formData, 'appointmentId'));
		const newRoomId = getRequiredFormDataString(formData, 'newRoomId');
		const newDayOfWeek = getRequiredFormDataString(formData, 'newDayOfWeek') as DayOfWeek;
		const newHour = Number(getRequiredFormDataString(formData, 'newHour'));

		// Validate inputs
		if (isNaN(appointmentId) || isNaN(newHour)) {
			return fail(400, { success: false, message: 'Geçersiz form verisi' });
		}

		// Get current appointment details with purchase info
		const { data: currentAppointment, error: fetchError } = await supabase
			.from('pe_appointments')
			.select(
				`
				*,
				pe_purchases(
					id,
					reschedule_left
				)
			`
			)
			.eq('id', appointmentId)
			.single();

		if (fetchError || !currentAppointment) {
			return fail(404, { success: false, message: 'Randevu bulunamadı' });
		}

		// Calculate time until appointment
		const now = new Date();
		const appointmentDateTime = new Date(
			currentAppointment.date + 'T' + String(currentAppointment.hour).padStart(2, '0') + ':00:00'
		);
		const millisecondsUntil = appointmentDateTime.getTime() - now.getTime();
		const hoursUntil = millisecondsUntil / (1000 * 60 * 60);

		// Rule 1: Past appointments are never reschedulable
		if (hoursUntil < 0) {
			return fail(400, {
				success: false,
				message: 'Başlamış olan randevuların vakti değiştirilemez'
			});
		}

		// Get purchase and reschedule information (needed for all roles)
		const purchase = currentAppointment.pe_purchases;
		const rescheduleLeft = purchase?.reschedule_left || 0;

		// Rule 2: Admin can reschedule any future appointment (no reschedule limit check)
		if (userRole === 'admin') {
			// Admin can proceed without checking reschedule limits
		}
		// Rule 3: For non-admin users, check reschedule permissions and limits
		else {
			// Check if reschedules are allowed and if there are reschedules remaining
			// Note: reschedule_left of 999 indicates unlimited reschedules (when reschedule_limit is null)
			if (rescheduleLeft <= 0) {
				return fail(400, {
					success: false,
					message: 'Bu satın alma için randevu değiştirme hakkı kalmamış'
				});
			}

			// Rule 4: Coordinator can only reschedule if there are reschedules left AND there are 23+ hours until appointment
			if (userRole === 'coordinator') {
				if (hoursUntil < 23) {
					return fail(400, {
						success: false,
						message: 'Randevu değişikliği en az 23 saat önceden yapılmalıdır'
					});
				}
			}
		}

		// Calculate the new appointment date based on the current appointment's week and new day of week
		const currentAppointmentDate = new Date(currentAppointment.date);

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
		const { data: conflictingAppointments } = await supabase
			.from('pe_appointments')
			.select('id')
			.eq('room_id', newRoomId)
			.eq('date', newAppointmentDateString)
			.eq('hour', newHour)
			.neq('id', appointmentId);

		if (conflictingAppointments && conflictingAppointments.length > 0) {
			return fail(400, { success: false, message: 'Yeni zaman dilimi zaten dolu' });
		}

		// Update appointment with new date, hour, and room
		const { error: updateError } = await supabase
			.from('pe_appointments')
			.update({
				hour: newHour,
				date: newAppointmentDateString,
				room_id: newRoomId
			})
			.eq('id', appointmentId);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Randevu güncellenirken hata: ' + updateError.message
			});
		}

		// Decrement reschedule_left count, but only if:
		// 1. Purchase exists
		// 2. User is not an admin (admins don't consume reschedule credits)
		// 3. Reschedule count is not unlimited (999)
		if (purchase && userRole !== 'admin') {
			const newRescheduleLeft = rescheduleLeft >= 999 ? 999 : Math.max(0, rescheduleLeft - 1);

			const { error: decrementError } = await supabase
				.from('pe_purchases')
				.update({
					reschedule_left: newRescheduleLeft
				})
				.eq('id', purchase.id)
				.gt('reschedule_left', 0); // Only update if reschedule_left is greater than 0

			if (decrementError) {
				console.error('Error decrementing reschedule count:', decrementError);
				// Don't fail the request if decrement fails, just log it
			}
		}

		return { success: true, message: 'Randevu vakti başarıyla değiştirildi' };
	}
};
