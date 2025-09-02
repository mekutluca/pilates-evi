import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { PackageAssignmentForm } from '$lib/types/Package';
import type { AppointmentWithRelations } from '$lib/types/Schedule';
import { randomUUID } from 'crypto';
import { getDateForDayOfWeek } from '$lib/utils/date-utils';
import { findOrCreateGroup } from '$lib/utils/group-utils';
import type { GroupCreationData } from '$lib/types/Group';

export const load: PageServerLoad = async ({ locals: { supabase, user, userRole }, url }) => {
	// Ensure admin and coordinator users can access this page
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	// Only fetch packages since rooms, trainers, trainees are inherited from parent layout
	const { data: packages, error: packagesError } = await supabase
		.from('pe_packages')
		.select('*')
		.eq('is_active', true)
		.order('name');

	if (packagesError) {
		throw error(500, 'Paketler yüklenirken hata oluştu: ' + packagesError.message);
	}

	// Check if we have query parameters for dynamic appointment loading
	const packageId = url.searchParams.get('package_id');
	const startDate = url.searchParams.get('start_date');
	const weeksDuration = url.searchParams.get('weeks_duration');

	let appointments: AppointmentWithRelations[] = [];

	// If we have package details, fetch appointments for the specific date range
	if (packageId && startDate && weeksDuration) {
		const start = new Date(startDate);
		const end = new Date(start);
		end.setDate(start.getDate() + parseInt(weeksDuration) * 7);

		const { data: rangeAppointments, error: appointmentsError } = await supabase
			.from('pe_appointments')
			.select(
				`
				*,
				pe_rooms!inner(id, name),
				pe_trainers!inner(id, name),
				pe_packages!inner(id, name)
			`
			)
			.eq('status', 'scheduled')
			.gte('appointment_date', start.toISOString().split('T')[0])
			.lt('appointment_date', end.toISOString().split('T')[0]);

		if (appointmentsError) {
			throw error(500, 'Randevular yüklenirken hata oluştu: ' + appointmentsError.message);
		}

		appointments = rangeAppointments || [];
	} else {
		// Initial load - fetch current week's appointments only for performance
		const today = new Date();
		const weekStart = new Date(today);
		weekStart.setDate(today.getDate() - today.getDay() + 1); // Get Monday of this week

		const weekEnd = new Date(weekStart);
		weekEnd.setDate(weekStart.getDate() + 7);

		const { data: weekAppointments, error: appointmentsError } = await supabase
			.from('pe_appointments')
			.select(
				`
				*,
				pe_rooms!inner(id, name),
				pe_trainers!inner(id, name),
				pe_packages!inner(id, name)
			`
			)
			.eq('status', 'scheduled')
			.gte('appointment_date', weekStart.toISOString().split('T')[0])
			.lt('appointment_date', weekEnd.toISOString().split('T')[0]);

		if (appointmentsError) {
			throw error(500, 'Randevular yüklenirken hata oluştu: ' + appointmentsError.message);
		}

		appointments = weekAppointments || [];
	}

	return {
		packages: packages || [],
		appointments
	};
};

export const actions: Actions = {
	createAssignment: async ({ request, locals: { supabase, user, userRole } }) => {
		// Ensure admin and coordinator users can perform this action
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, {
				success: false,
				message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
			});
		}

		const formData = await request.formData();
		const assignmentFormJson = formData.get('assignmentData') as string;

		if (!assignmentFormJson) {
			return fail(400, {
				success: false,
				message: 'Atama verileri eksik'
			});
		}

		let assignmentForm: PackageAssignmentForm;
		try {
			assignmentForm = JSON.parse(assignmentFormJson);
		} catch {
			return fail(400, {
				success: false,
				message: 'Atama verileri geçersiz format'
			});
		}

		// Validate required fields
		if (
			!assignmentForm.package_id ||
			!assignmentForm.room_id ||
			!assignmentForm.trainer_id ||
			!assignmentForm.start_date ||
			assignmentForm.time_slots.length === 0
		) {
			return fail(400, {
				success: false,
				message: 'Paket, oda, eğitmen, başlangıç haftası ve zaman dilimi seçimi gereklidir'
			});
		}

		// Get package details to validate capacity and settings
		const { data: packageData, error: packageError } = await supabase
			.from('pe_packages')
			.select('*')
			.eq('id', assignmentForm.package_id)
			.single();

		if (packageError || !packageData) {
			return fail(400, {
				success: false,
				message: 'Seçilen paket bulunamadı'
			});
		}

		// Validate trainee selection based on package type
		if (packageData.trainee_type === 'fixed' && assignmentForm.trainee_ids.length === 0) {
			return fail(400, {
				success: false,
				message: 'Sabit paket türü için en az bir öğrenci seçmelisiniz'
			});
		}

		// Validate trainee count against package capacity
		if (assignmentForm.trainee_ids.length > packageData.max_capacity) {
			return fail(400, {
				success: false,
				message: `Maksimum ${packageData.max_capacity} öğrenci seçilebilir`
			});
		}

		// Validate lessons per week
		if (assignmentForm.time_slots.length !== packageData.lessons_per_week) {
			return fail(400, {
				success: false,
				message: `Bu paket için ${packageData.lessons_per_week} zaman dilimi seçmelisiniz`
			});
		}

		try {
			// Check availability across all weeks before creating any appointments
			const weeksToCreate = packageData.weeks_duration || 52; // Default to 52 weeks if unlimited
			const startDate = new Date(assignmentForm.start_date);

			for (const slot of assignmentForm.time_slots) {
				for (let week = 0; week < weeksToCreate; week++) {
					// Calculate appointment date based on start date and week offset
					const appointmentDate = new Date(startDate);
					appointmentDate.setDate(startDate.getDate() + week * 7);

					// Check if this specific time slot is available for the room and trainer
					const { data: conflictingAppointment } = await supabase
						.from('pe_appointments')
						.select('id')
						.eq('room_id', assignmentForm.room_id)
						.eq('trainer_id', assignmentForm.trainer_id)
						.eq('appointment_date', appointmentDate.toISOString().split('T')[0])
						.eq('hour', slot.hour)
						.eq('status', 'scheduled')
						.maybeSingle();

					if (conflictingAppointment) {
						const dateStr = appointmentDate.toLocaleDateString('tr-TR');
						return fail(400, {
							success: false,
							message: `${dateStr} tarihindeki ${slot.hour}:00 zaman dilimi seçilen oda ve eğitmen için zaten dolu`
						});
					}
				}
			}

			// Get trainee names for group name generation
			let traineeNames: string[] = [];
			if (assignmentForm.trainee_ids.length > 0) {
				const { data: trainees } = await supabase
					.from('pe_trainees')
					.select('name')
					.in('id', assignmentForm.trainee_ids);
				traineeNames = trainees?.map((t) => t.name) || [];
			}

			// Create or find group based on package type
			const groupCreationData: GroupCreationData = {
				type: packageData.trainee_type === 'fixed' ? 'fixed' : 'dynamic',
				trainee_ids: assignmentForm.trainee_ids
			};

			const groupResult = await findOrCreateGroup(
				supabase,
				groupCreationData,
				packageData.trainee_type
			);
			if (groupResult.error) {
				return fail(500, {
					success: false,
					message: 'Grup oluşturulurken hata: ' + groupResult.error
				});
			}

			// Create package-group relationship
			const { error: packageGroupError } = await supabase.from('pe_package_groups').insert({
				package_id: assignmentForm.package_id,
				group_id: groupResult.group_id
			});

			if (packageGroupError) {
				return fail(500, {
					success: false,
					message: 'Paket-grup ilişkisi oluşturulurken hata: ' + packageGroupError.message
				});
			}

			// Start transaction - create appointments for each time slot
			const appointmentPromises = assignmentForm.time_slots.map(async (slot) => {
				// Generate series_id for grouping appointments
				const seriesId = randomUUID();

				// Create appointment for each week based on package duration
				const appointments = [];

				for (let week = 0; week < weeksToCreate; week++) {
					// Calculate the actual appointment date for this slot's day of the week
					// startDate is the Monday of the selected week, so we need to get the correct day
					const weekStart = new Date(startDate);
					weekStart.setDate(startDate.getDate() + week * 7); // Add week offset

					// Get the actual date for this day of the week within the target week
					const appointmentDate = getDateForDayOfWeek(weekStart, slot.day);

					appointments.push({
						package_id: assignmentForm.package_id,
						room_id: assignmentForm.room_id,
						trainer_id: assignmentForm.trainer_id,
						group_id: groupResult.group_id,
						hour: slot.hour,
						appointment_date: appointmentDate.toISOString().split('T')[0],
						series_id: seriesId,
						session_number: week + 1,
						total_sessions: weeksToCreate,
						status: 'scheduled',
						created_by: user.id
					});
				}

				return appointments;
			});

			const allAppointments = (await Promise.all(appointmentPromises)).flat();

			// Insert all appointments
			const { data: createdAppointments, error: appointmentsError } = await supabase
				.from('pe_appointments')
				.insert(allAppointments)
				.select('id');

			if (appointmentsError) {
				return fail(500, {
					success: false,
					message: 'Randevular oluşturulurken hata: ' + appointmentsError.message
				});
			}

			const message = groupResult.created
				? `${allAppointments.length} randevu ve yeni grup başarıyla oluşturuldu`
				: `${allAppointments.length} randevu oluşturuldu ve mevcut grup kullanıldı`;

			return {
				success: true,
				message
			};
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Bilinmeyen hata';
			return fail(500, {
				success: false,
				message: 'Randevular oluşturulurken beklenmeyen hata: ' + errorMessage
			});
		}
	}
};
