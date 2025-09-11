import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { PackageAssignmentForm } from '$lib/types/Package';
import type {
	AppointmentWithRelations,
	ExistingAppointmentSeries,
	TraineeGroupData,
	AppointmentSeriesData,
	ProcessedGroupData
} from '$lib/types/Schedule';
import { randomUUID } from 'crypto';
import { getDateForDayOfWeek } from '$lib/utils/date-utils';
import { findOrCreateGroup } from '$lib/utils/group-utils';
import type { GroupCreationData } from '$lib/types/Group';

// Helper function to process appointment series data
function processAppointmentSeries(
	seriesData: AppointmentSeriesData[],
	packageId?: string
): ExistingAppointmentSeries[] {
	const groupMap = new Map<string | number, ProcessedGroupData>();

	seriesData?.forEach((appointment) => {
		const key = packageId
			? appointment.group_id
			: `${appointment.group_id}-${appointment.package_id}`;

		if (!groupMap.has(key)) {
			// Calculate current capacity (active trainees)
			const activeTrainees =
				appointment.pe_groups?.pe_trainee_groups?.filter((tg: TraineeGroupData) => !tg.left_at) ||
				[];
			const currentCapacity = activeTrainees.length;

			groupMap.set(key, {
				package_id: packageId ? parseInt(packageId) : appointment.package_id!,
				group_id: appointment.group_id,
				room_name: appointment.pe_rooms?.name,
				trainer_name: appointment.pe_trainers?.name,
				current_capacity: currentCapacity,
				max_capacity: appointment.pe_packages?.max_capacity || 0,
				day_time_slots: new Map<number, Set<number>>()
			});
		}

		const group = groupMap.get(key)!;

		// Track day-time combinations
		const dayOfWeek = new Date(appointment.appointment_date).getDay();
		if (!group.day_time_slots.has(dayOfWeek)) {
			group.day_time_slots.set(dayOfWeek, new Set<number>());
		}
		group.day_time_slots.get(dayOfWeek)!.add(appointment.hour);
	});

	// Convert day_time_slots Map to array and format the data
	return Array.from(groupMap.values()).map((group) => {
		const dayTimeCombinations: Array<{ day: number; hours: number[] }> = [];
		for (const [day, hours] of group.day_time_slots.entries()) {
			dayTimeCombinations.push({
				day: day,
				hours: Array.from(hours).sort()
			});
		}
		return {
			package_id: group.package_id,
			group_id: group.group_id,
			room_name: group.room_name || 'Belirtilmemiş',
			trainer_name: group.trainer_name || 'Belirtilmemiş',
			current_capacity: group.current_capacity,
			max_capacity: group.max_capacity,
			day_time_combinations: dayTimeCombinations
		};
	});
}

// Helper function to get appointment series query string
function getAppointmentSeriesQuery(): string {
	return `
		series_id,
		group_id,
		pe_groups!inner(id, type, pe_trainee_groups(pe_trainees(id), left_at)),
		pe_rooms!inner(id, name),
		pe_trainers!inner(id, name),
		pe_packages!inner(id, name, max_capacity),
		hour,
		appointment_date,
		session_number,
		total_sessions
	`;
}

// Helper function to get basic appointment query string
function getBasicAppointmentQuery(): string {
	return `
		*,
		pe_rooms!inner(id, name),
		pe_trainers!inner(id, name),
		pe_packages!inner(id, name)
	`;
}

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
	const selectedGroupId = url.searchParams.get('selected_group_id');

	let appointments: AppointmentWithRelations[] = [];
	let existingAppointmentSeries: ExistingAppointmentSeries[] = [];
	let existingGroupTrainees: number[] = [];

	// If we have package details, fetch appointments for the specific date range
	if (packageId && startDate && weeksDuration) {
		const start = new Date(startDate);
		const end = new Date(start);
		end.setDate(start.getDate() + parseInt(weeksDuration) * 7);

		const { data: rangeAppointments, error: appointmentsError } = await supabase
			.from('pe_appointments')
			.select(getBasicAppointmentQuery())
			.eq('status', 'scheduled')
			.gte('appointment_date', start.toISOString().split('T')[0])
			.lt('appointment_date', end.toISOString().split('T')[0]);

		if (appointmentsError) {
			throw error(500, 'Randevular yüklenirken hata oluştu: ' + appointmentsError.message);
		}

		appointments = rangeAppointments || [];

		// Also fetch existing appointment series for this package (for group selection)
		const { data: seriesData, error: seriesError } = await supabase
			.from('pe_appointments')
			.select(getAppointmentSeriesQuery())
			.eq('package_id', packageId)
			.eq('status', 'scheduled')
			.gte('appointment_date', new Date().toISOString().split('T')[0]) // Only future appointments
			.order('appointment_date');

		if (seriesError) {
			throw error(500, 'Mevcut randevu serileri yüklenirken hata: ' + seriesError.message);
		}

		// Process appointment series for this specific package
		existingAppointmentSeries = processAppointmentSeries(seriesData, packageId);
	} else {
		// Initial load - fetch current week's appointments only for performance
		const today = new Date();
		const weekStart = new Date(today);
		weekStart.setDate(today.getDate() - today.getDay() + 1); // Get Monday of this week

		const weekEnd = new Date(weekStart);
		weekEnd.setDate(weekStart.getDate() + 7);

		const { data: weekAppointments, error: appointmentsError } = await supabase
			.from('pe_appointments')
			.select(getBasicAppointmentQuery())
			.eq('status', 'scheduled')
			.gte('appointment_date', weekStart.toISOString().split('T')[0])
			.lt('appointment_date', weekEnd.toISOString().split('T')[0]);

		if (appointmentsError) {
			throw error(500, 'Randevular yüklenirken hata oluştu: ' + appointmentsError.message);
		}

		appointments = weekAppointments || [];

		// Always fetch existing appointment series for group packages (for group selection)
		// Get all group packages to fetch their existing series
		const groupPackages = packages?.filter((pkg) => pkg.package_type === 'group') || [];

		if (groupPackages.length > 0) {
			const groupPackageIds = groupPackages.map((pkg) => pkg.id);

			const { data: seriesData, error: seriesError } = await supabase
				.from('pe_appointments')
				.select(`package_id, ${getAppointmentSeriesQuery()}`)
				.in('package_id', groupPackageIds)
				.eq('status', 'scheduled')
				.gte('appointment_date', new Date().toISOString().split('T')[0]) // Only future appointments
				.order('appointment_date');

			if (seriesError) {
				throw error(500, 'Mevcut randevu serileri yüklenirken hata: ' + seriesError.message);
			}

			// Process appointment series for all group packages
			existingAppointmentSeries = processAppointmentSeries(seriesData);
		}
	}

	// If a specific group is selected, fetch its existing trainees
	if (selectedGroupId) {
		const { data: groupTrainees, error: groupTraineesError } = await supabase
			.from('pe_trainee_groups')
			.select('trainee_id')
			.eq('group_id', parseInt(selectedGroupId))
			.is('left_at', null); // Only active trainees

		if (groupTraineesError) {
			throw error(500, 'Grup öğrencileri yüklenirken hata: ' + groupTraineesError.message);
		}

		existingGroupTrainees = groupTrainees?.map((tg) => tg.trainee_id) || [];
	}

	return {
		packages: packages || [],
		appointments,
		existingAppointmentSeries,
		existingGroupTrainees
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

		// Check if this is an existing group assignment (has group_id but no room/trainer/slots)
		const isExistingGroupAssignment =
			assignmentForm.group_id &&
			(!assignmentForm.room_id ||
				!assignmentForm.trainer_id ||
				assignmentForm.time_slots.length === 0);

		// Validate required fields based on assignment type
		if (!assignmentForm.package_id) {
			return fail(400, {
				success: false,
				message: 'Paket seçimi gereklidir'
			});
		}

		if (!isExistingGroupAssignment) {
			// For new appointments, validate all fields
			if (
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
		if (packageData.package_type === 'private' && assignmentForm.trainee_ids.length === 0) {
			return fail(400, {
				success: false,
				message: 'Özel ders türü için en az bir öğrenci seçmelisiniz'
			});
		}

		// Validate trainee count against package capacity
		if (assignmentForm.trainee_ids.length > packageData.max_capacity) {
			return fail(400, {
				success: false,
				message: `Maksimum ${packageData.max_capacity} öğrenci seçilebilir`
			});
		}

		// Validate lessons per week (only for new appointments)
		if (
			!isExistingGroupAssignment &&
			assignmentForm.time_slots.length !== packageData.lessons_per_week
		) {
			return fail(400, {
				success: false,
				message: `Bu paket için ${packageData.lessons_per_week} zaman dilimi seçmelisiniz`
			});
		}

		try {
			// SCENARIO 3: Group package with existing group selected
			// Just add trainees to existing group, no appointments or package-group relationship needed
			if (isExistingGroupAssignment && assignmentForm.group_id) {
				// Add trainees to the existing group
				const traineeGroupInserts = assignmentForm.trainee_ids.map((traineeId) => ({
					group_id: assignmentForm.group_id!,
					trainee_id: traineeId,
					joined_at: new Date().toISOString()
				}));

				const { error: traineeGroupError } = await supabase
					.from('pe_trainee_groups')
					.insert(traineeGroupInserts);

				if (traineeGroupError) {
					return fail(500, {
						success: false,
						message: 'Öğrenciler gruba eklenirken hata: ' + traineeGroupError.message
					});
				}

				return {
					success: true,
					message: `${assignmentForm.trainee_ids.length} öğrenci mevcut gruba başarıyla eklendi`
				};
			}

			// SCENARIOS 1 & 2: Need to create appointments and handle groups

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

			let groupResult;
			let shouldCreatePackageGroup = false;

			// SCENARIO 1: Private package - always find or create group based on trainees
			if (packageData.package_type === 'private') {
				const groupCreationData: GroupCreationData = {
					type: 'fixed',
					trainee_ids: assignmentForm.trainee_ids
				};

				groupResult = await findOrCreateGroup(supabase, groupCreationData, 'fixed');
				if (groupResult.error) {
					return fail(500, {
						success: false,
						message: 'Grup oluşturulurken hata: ' + groupResult.error
					});
				}

				// Always create package-group relationship for private packages
				shouldCreatePackageGroup = true;
			}
			// SCENARIO 2: Group package with new group creation - always create new group
			else if (packageData.package_type === 'group') {
				// Always create new group (don't use findOrCreateGroup)
				const { data: newGroup, error: groupError } = await supabase
					.from('pe_groups')
					.insert({ type: 'dynamic' })
					.select('id')
					.single();

				if (groupError || !newGroup) {
					return fail(500, {
						success: false,
						message: 'Yeni grup oluşturulurken hata: ' + (groupError?.message || 'Bilinmeyen hata')
					});
				}

				// Add trainees to the new group if any selected
				if (assignmentForm.trainee_ids.length > 0) {
					const traineeGroupInserts = assignmentForm.trainee_ids.map((traineeId) => ({
						group_id: newGroup.id,
						trainee_id: traineeId,
						joined_at: new Date().toISOString()
					}));

					const { error: traineeGroupError } = await supabase
						.from('pe_trainee_groups')
						.insert(traineeGroupInserts);

					if (traineeGroupError) {
						return fail(500, {
							success: false,
							message: 'Öğrenciler gruba eklenirken hata: ' + traineeGroupError.message
						});
					}
				}

				groupResult = { group_id: newGroup.id, created: true };
				shouldCreatePackageGroup = true;
			}

			// Create package-group relationship when needed
			if (shouldCreatePackageGroup && groupResult) {
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
			}

			// Create appointments for scenarios 1 & 2
			if (groupResult) {
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
				const { error: appointmentsError } = await supabase
					.from('pe_appointments')
					.insert(allAppointments);

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
			}

			// This should never happen, but just in case
			return fail(500, {
				success: false,
				message: 'Beklenmeyen hata: Grup sonucu bulunamadı'
			});
		} catch (err) {
			console.error('Appointment creation error:', err);
			const errorMessage = err instanceof Error ? err.message : 'Bilinmeyen hata';
			return fail(500, {
				success: false,
				message: 'Randevular oluşturulurken beklenmeyen hata: ' + errorMessage
			});
		}
	}
};
