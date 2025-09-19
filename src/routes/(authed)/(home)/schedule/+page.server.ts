import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Role } from '$lib/types/Role';
import type { User } from '@supabase/auth-js';
import { getRequiredFormDataString } from '$lib/utils/form-utils';
import type { DayOfWeek, AppointmentStatus } from '$lib/types/Schedule';
import type { TimeSlotPattern } from '$lib/types/index';

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
	const { data: appointments, error: appointmentsError } = await supabase
		.from('pe_appointments')
		.select(
			`
			*,
			pe_package_groups(
				id,
				reschedule_left,
				start_date,
				end_date,
				successor_id,
				time_slots,
				pe_rooms(id, name),
				pe_trainers(id, name),
				pe_packages(name, reschedulable, weeks_duration, lessons_per_week),
				pe_groups(
					id,
					type,
					pe_trainee_groups(
						pe_trainees(name),
						left_at
					)
				)
			)
		`
		)
		.gte('appointment_date', weekStart.toISOString().split('T')[0])
		.lte('appointment_date', weekEnd.toISOString().split('T')[0])
		.order('appointment_date, hour');

	if (appointmentsError) {
		console.error('Error fetching appointments:', appointmentsError);
	}

	// Also fetch all scheduled appointments for conflict checking during extensions
	const { data: allAppointments, error: allAppointmentsError } = await supabase
		.from('pe_appointments')
		.select(
			`
			*,
			pe_package_groups(
				id,
				pe_rooms(id),
				pe_trainers(id)
			)
		`
		)
		.eq('status', 'scheduled')
		.order('appointment_date, hour');

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
		const newRoomId = Number(getRequiredFormDataString(formData, 'newRoomId'));
		const newDayOfWeek = getRequiredFormDataString(formData, 'newDayOfWeek') as DayOfWeek;
		const newHour = Number(getRequiredFormDataString(formData, 'newHour'));
		// Note: reason field removed since reschedule history is now handled at package level

		// Validate inputs
		if (isNaN(appointmentId) || isNaN(newRoomId) || isNaN(newHour)) {
			return fail(400, { success: false, message: 'Geçersiz form verisi' });
		}

		// Get current appointment details with package group info
		const { data: currentAppointment, error: fetchError } = await supabase
			.from('pe_appointments')
			.select(
				`
				*,
				pe_package_groups(
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
			currentAppointment.appointment_date +
				'T' +
				String(currentAppointment.hour).padStart(2, '0') +
				':00:00'
		);
		const millisecondsUntil = appointmentDateTime.getTime() - now.getTime();
		const hoursUntil = millisecondsUntil / (1000 * 60 * 60);

		// Rule 1: Past appointments are never reschedulable
		if (hoursUntil < 0) {
			return fail(400, {
				success: false,
				message: 'Başlamış olan randevular ertelenemez'
			});
		}

		// Check if the package group has reschedules remaining
		const packageGroup = currentAppointment.pe_package_groups;
		const rescheduleLeft = packageGroup?.reschedule_left || 0;

		// Check if reschedules are allowed and if there are reschedules remaining
		// Note: reschedule_left of 999 indicates unlimited reschedules (when reschedule_limit is null)
		if (rescheduleLeft <= 0) {
			return fail(400, {
				success: false,
				message: 'Bu grup için erteleme hakkı kalmamış'
			});
		}

		// Rule 3: Admin can reschedule any future appointment if reschedules are available
		if (userRole === 'admin') {
			// Already checked hoursUntil > 0 and rescheduleLeft > 0 above, so admin can proceed
		}
		// Rule 4: Coordinator can only reschedule if there are reschedules left AND there are 23+ hours until appointment
		else if (userRole === 'coordinator') {
			if (hoursUntil < 23) {
				return fail(400, {
					success: false,
					message: 'Randevu değişikliği en az 23 saat önceden yapılmalıdır'
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
		const { data: conflictingAppointments } = await supabase
			.from('pe_appointments')
			.select('id, pe_package_groups!inner(room_id)')
			.eq('pe_package_groups.room_id', newRoomId)
			.eq('appointment_date', newAppointmentDateString)
			.eq('hour', newHour)
			.eq('status', 'scheduled')
			.neq('id', appointmentId);

		if (conflictingAppointments && conflictingAppointments.length > 0) {
			return fail(400, { success: false, message: 'Yeni zaman dilimi zaten dolu' });
		}

		// No room availability check needed - all time slots are available

		// Update appointment (only date and hour, room is in package group)
		const { error: updateError } = await supabase
			.from('pe_appointments')
			.update({
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

		// Update package group room
		const { error: roomUpdateError } = await supabase
			.from('pe_package_groups')
			.update({
				room_id: newRoomId
			})
			.eq('id', packageGroup.id);

		if (roomUpdateError) {
			return fail(500, {
				success: false,
				message: 'Oda bilgisi güncellenirken hata: ' + roomUpdateError.message
			});
		}

		// Decrement reschedule_left count, but only if it's not unlimited (999)
		// For unlimited reschedules, keep the count at 999
		const newRescheduleLeft = rescheduleLeft >= 999 ? 999 : Math.max(0, rescheduleLeft - 1);

		const { error: decrementError } = await supabase
			.from('pe_package_groups')
			.update({
				reschedule_left: newRescheduleLeft
			})
			.eq('id', packageGroup.id)
			.gt('reschedule_left', 0); // Only update if reschedule_left is greater than 0

		if (decrementError) {
			console.error('Error decrementing reschedule count:', decrementError);
			// Don't fail the request if decrement fails, just log it
		}

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
	},

	extendPackage: async ({ request, locals: { supabase, user } }) => {
		if (!user) {
			return fail(401, { success: false, message: 'Unauthorized' });
		}

		const formData = await request.formData();

		try {
			const packageGroupId = parseInt(getRequiredFormDataString(formData, 'package_group_id'));
			const packageCount = parseInt(getRequiredFormDataString(formData, 'package_count'));

			if (packageCount < 1 || packageCount > 20) {
				return fail(400, {
					success: false,
					message: 'Paket sayısı 1 ile 20 arasında olmalıdır'
				});
			}

			// Get original package group data
			const { data: originalPackageGroup, error: fetchError } = await supabase
				.from('pe_package_groups')
				.select(
					'*, pe_packages!inner(package_type, reschedule_limit, reschedulable, weeks_duration)'
				)
				.eq('id', packageGroupId)
				.single();

			if (fetchError || !originalPackageGroup) {
				return fail(400, {
					success: false,
					message: 'Paket grubu bulunamadı'
				});
			}

			// Only allow extending private packages
			if (originalPackageGroup.pe_packages.package_type !== 'private') {
				return fail(400, {
					success: false,
					message: 'Sadece özel paketler uzatılabilir'
				});
			}

			// Check if this package has already been extended (has a successor)
			if (originalPackageGroup.successor_id !== null) {
				return fail(400, {
					success: false,
					message: 'Bu paket zaten uzatılmış. Uzatma işlemi sadece en son pakete yapılabilir'
				});
			}

			// Get the package duration
			const packageWeeksDuration = originalPackageGroup.pe_packages.weeks_duration;
			if (!packageWeeksDuration) {
				return fail(400, {
					success: false,
					message: 'Paket süre bilgisi bulunamadı'
				});
			}

			// Check for conflicts before creating extensions
			const roomId = originalPackageGroup.room_id;
			const trainerId = originalPackageGroup.trainer_id;
			const timeSlots = originalPackageGroup.time_slots as TimeSlotPattern[];

			// Calculate starting date for extensions
			const originalEndDate = new Date(originalPackageGroup.end_date!);

			// Check each package extension for conflicts
			for (let packageIndex = 0; packageIndex < packageCount; packageIndex++) {
				const packageStartDate = new Date(originalEndDate);
				packageStartDate.setDate(
					originalEndDate.getDate() + 1 + packageIndex * packageWeeksDuration * 7
				);

				// Check each time slot for each week in this package
				for (const slot of timeSlots) {
					for (let week = 0; week < packageWeeksDuration; week++) {
						const appointmentDate = new Date(packageStartDate);
						appointmentDate.setDate(packageStartDate.getDate() + week * 7);

						// Calculate the actual date for this day of week
						const dayNames = [
							'sunday',
							'monday',
							'tuesday',
							'wednesday',
							'thursday',
							'friday',
							'saturday'
						];
						const targetDayIndex = dayNames.indexOf(slot.day);
						const currentDayIndex = appointmentDate.getDay();
						const daysToAdd = (targetDayIndex - currentDayIndex + 7) % 7;

						appointmentDate.setDate(appointmentDate.getDate() + daysToAdd);

						// Check for conflicts with existing appointments
						const { data: conflictingAppointment } = await supabase
							.from('pe_appointments')
							.select('id, pe_package_groups!inner(room_id, trainer_id)')
							.or(
								`pe_package_groups.room_id.eq.${roomId},pe_package_groups.trainer_id.eq.${trainerId}`
							)
							.eq('appointment_date', appointmentDate.toISOString().split('T')[0])
							.eq('hour', slot.hour)
							.eq('status', 'scheduled')
							.maybeSingle();

						if (conflictingAppointment) {
							const dateStr = appointmentDate.toLocaleDateString('tr-TR');
							const dayNames_TR = [
								'Pazar',
								'Pazartesi',
								'Salı',
								'Çarşamba',
								'Perşembe',
								'Cuma',
								'Cumartesi'
							];
							const dayName = dayNames_TR[appointmentDate.getDay()];

							return fail(400, {
								success: false,
								message: `${dateStr} (${dayName}) tarihindeki ${slot.hour}:00 zaman dilimi seçilen oda veya eğitmen için zaten dolu. Paket ${packageIndex + 1} oluşturulamaz.`
							});
						}
					}
				}
			}

			// Create multiple package group entries (conflicts already checked above)
			const createdPackageGroups = [];
			let previousPackageGroupId = packageGroupId;

			for (let i = 0; i < packageCount; i++) {
				const extensionStartDate = new Date(originalEndDate);
				extensionStartDate.setDate(originalEndDate.getDate() + 1 + i * packageWeeksDuration * 7);

				const extensionEndDate = new Date(extensionStartDate);
				extensionEndDate.setDate(extensionStartDate.getDate() + packageWeeksDuration * 7 - 1);

				const extensionAppointmentsUntil = new Date(extensionEndDate);

				// Create new package group entry
				const { data: extensionPackageGroup, error: extensionError } = await supabase
					.from('pe_package_groups')
					.insert({
						package_id: originalPackageGroup.package_id,
						group_id: originalPackageGroup.group_id,
						reschedule_left: originalPackageGroup.pe_packages.reschedulable
							? (originalPackageGroup.pe_packages.reschedule_limit ?? 999)
							: 0,
						start_date: extensionStartDate.toISOString().split('T')[0],
						end_date: extensionEndDate.toISOString().split('T')[0],
						appointments_created_until: extensionAppointmentsUntil.toISOString().split('T')[0],
						time_slots: originalPackageGroup.time_slots,
						room_id: originalPackageGroup.room_id,
						trainer_id: originalPackageGroup.trainer_id
					})
					.select('id')
					.single();

				if (extensionError) {
					// Rollback: delete any previously created package groups
					for (const createdGroup of createdPackageGroups) {
						await supabase.from('pe_package_groups').delete().eq('id', createdGroup.id);
					}
					return fail(500, {
						success: false,
						message: 'Uzatma işlemi sırasında hata oluştu: ' + extensionError.message
					});
				}

				createdPackageGroups.push(extensionPackageGroup);

				// Update the predecessor's successor_id to point to this new package
				const { error: updateSuccessorError } = await supabase
					.from('pe_package_groups')
					.update({ successor_id: extensionPackageGroup.id })
					.eq('id', previousPackageGroupId);

				if (updateSuccessorError) {
					console.error('Error updating successor_id:', updateSuccessorError);
					// Don't fail the request if successor update fails, just log it
				}

				// Set this package as the predecessor for the next iteration
				previousPackageGroupId = extensionPackageGroup.id;
			}

			// Create appointments for all extension packages
			const allAppointments = [];

			for (let packageIndex = 0; packageIndex < createdPackageGroups.length; packageIndex++) {
				const extensionPackageGroup = createdPackageGroups[packageIndex];

				// Calculate start date for this package
				const packageStartDate = new Date(originalEndDate);
				packageStartDate.setDate(
					originalEndDate.getDate() + 1 + packageIndex * packageWeeksDuration * 7
				);

				const appointmentPromises = timeSlots.map(async (slot: TimeSlotPattern) => {
					const appointments = [];

					for (let week = 0; week < packageWeeksDuration; week++) {
						const appointmentDate = new Date(packageStartDate);
						appointmentDate.setDate(packageStartDate.getDate() + week * 7);

						// Calculate the actual date for this day of the week
						const dayNames = [
							'sunday',
							'monday',
							'tuesday',
							'wednesday',
							'thursday',
							'friday',
							'saturday'
						];
						const targetDayIndex = dayNames.indexOf(slot.day);
						const currentDayIndex = appointmentDate.getDay();
						const daysToAdd = (targetDayIndex - currentDayIndex + 7) % 7;

						appointmentDate.setDate(appointmentDate.getDate() + daysToAdd);

						appointments.push({
							package_group_id: extensionPackageGroup.id,
							hour: slot.hour,
							appointment_date: appointmentDate.toISOString().split('T')[0],
							series_id: originalPackageGroup.id.toString(),
							session_number: week + 1,
							total_sessions: packageWeeksDuration,
							status: 'scheduled',
							created_by: user.id
						});
					}

					return appointments;
				});

				const packageAppointments = (await Promise.all(appointmentPromises)).flat();
				allAppointments.push(...packageAppointments);
			}

			// Insert all extension appointments
			const { error: appointmentsError } = await supabase
				.from('pe_appointments')
				.insert(allAppointments);

			if (appointmentsError) {
				// Rollback: delete all created package groups
				for (const createdGroup of createdPackageGroups) {
					await supabase.from('pe_package_groups').delete().eq('id', createdGroup.id);
				}
				return fail(500, {
					success: false,
					message: 'Randevular oluşturulurken hata oluştu: ' + appointmentsError.message
				});
			}

			return {
				success: true,
				message: `Paket başarıyla ${packageCount} kez uzatıldı`
			};
		} catch (err) {
			return fail(400, {
				success: false,
				message: err instanceof Error ? err.message : 'Geçersiz form verisi'
			});
		}
	}
};
