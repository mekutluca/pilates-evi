import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type {
	PackagePurchaseForm,
	ExistingGroupLesson,
	Appointment,
	AvailableGroupTimeslot
} from '$lib/types';
import { randomUUID } from 'crypto';
import { parseLocalDate, getDayOfWeekFromDate, formatDateForDB } from '$lib/utils/date-utils';
import { ConflictService } from '$lib/server/services/conflict-service';
import { isValidUuid } from '$lib/utils/validation';

// Type for group lesson query result with joined tables
interface GroupLessonQueryResult {
	id: string;
	package_id: string | null;
	start_date: string | null;
	end_date: string | null;
	room_id: string | null;
	trainer_id: string | null;
	timeslots: Array<{ day: string; hours: number[] }> | null;
	pe_packages: { id: string; name: string; max_capacity: number } | null;
	pe_rooms: { id: string; name: string } | null;
	pe_trainers: { id: string; name: string } | null;
}

export const load: PageServerLoad = async ({
	locals: { supabase, user, userRole },
	url,
	parent
}) => {
	// Ensure admin and coordinator users can access this page
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	// Get all layout data (packages, trainers, rooms, trainees are inherited from parent layout)
	const { packages: allPackages } = await parent();
	const packages = allPackages
		.filter((pkg) => pkg.is_active !== false)
		.sort((a, b) => a.name.localeCompare(b.name));

	// Check if we have query parameters for dynamic appointment loading
	const packageId = url.searchParams.get('package_id');
	const roomId = url.searchParams.get('room_id');
	const trainerId = url.searchParams.get('trainer_id');
	const weeksDuration = url.searchParams.get('weeks_duration');
	const startDateParam = url.searchParams.get('start_date');

	// IDs are spliced into PostgREST or() filters below — reject anything that isn't a UUID
	for (const id of [packageId, roomId, trainerId]) {
		if (id && !isValidUuid(id)) {
			throw error(400, 'Geçersiz parametre');
		}
	}

	let appointments: Appointment[] = [];
	let existingGroupLessons: ExistingGroupLesson[] = [];
	let existingGroupLessonTrainees: string[] = [];
	const availableGroupTimeslots: AvailableGroupTimeslot[] = [];

	// Fetch existing group lessons for the selected package (if viewing group packages)
	if (packageId) {
		const { data: groupLessons, error: groupLessonsError } = await supabase
			.from('pe_group_lessons')
			.select(
				`
				id,
				package_id,
				start_date,
				end_date,
				room_id,
				trainer_id,
				timeslots,
				pe_packages(id, name, max_capacity),
				pe_rooms(id, name),
				pe_trainers(id, name)
			`
			)
			.eq('package_id', packageId)
			.is('end_date', null); // Only active group lessons

		if (groupLessonsError) {
			console.error('Error loading group lessons:', groupLessonsError);
		} else if (groupLessons && groupLessons.length > 0) {
			// Cast to proper type for joined query results
			const typedGroupLessons = groupLessons as GroupLessonQueryResult[];

			// Transform group lessons into the format expected by the UI
			existingGroupLessons = typedGroupLessons.map((gl) => {
				// Parse timeslots JSON to get day_time_combinations
				const timeslots = gl.timeslots || [];
				const day_time_combinations = Array.isArray(timeslots) ? timeslots : [];

				return {
					group_lesson_id: gl.id,
					package_id: gl.package_id || '',
					room_id: gl.room_id || '',
					room_name: gl.pe_rooms?.name || '',
					trainer_id: gl.trainer_id || '',
					trainer_name: gl.pe_trainers?.name || '',
					max_capacity: gl.pe_packages?.max_capacity || 0,
					current_capacity: 0, // Will be calculated below with appointment_trainees
					day_time_combinations
				};
			});

			// Get current capacity for each group lesson using appointment_trainees
			for (const groupLesson of existingGroupLessons) {
				// Get all appointments for this group lesson
				const { data: appointments, error: apptsError } = await supabase
					.from('pe_appointments')
					.select('id')
					.eq('group_lesson_id', groupLesson.group_lesson_id);

				if (!apptsError && appointments && appointments.length > 0) {
					const appointmentIds = appointments.map((apt) => apt.id);

					const { data: appointmentTrainees, error: traineesError } = await supabase
						.from('pe_appointment_trainees')
						.select('trainee_id')
						.in('appointment_id', appointmentIds);

					if (!traineesError && appointmentTrainees) {
						// Get unique trainee IDs for this group lesson
						const uniqueTrainees = new Set(appointmentTrainees.map((at) => at.trainee_id));
						groupLesson.current_capacity = uniqueTrainees.size;
					}
				}
			}

			// Build available timeslots with per-timeslot capacity.
			// Capacity is computed against the next canonical appointment matching
			// (group_lesson_id, day-of-week, hour) — filtering by hour alone would mix
			// trainees across different days that share the same hour.
			const tomorrow = new Date();
			tomorrow.setDate(tomorrow.getDate() + 1);
			const tomorrowStr = formatDateForDB(tomorrow);

			for (const gl of typedGroupLessons) {
				const timeslots = gl.timeslots || [];
				const maxCapacity = gl.pe_packages?.max_capacity || 0;

				if (timeslots.length === 0) continue;

				const { data: upcomingAppointments } = await supabase
					.from('pe_appointments')
					.select('id, date, hour, pe_appointment_trainees(trainee_id)')
					.eq('group_lesson_id', gl.id)
					.gte('date', tomorrowStr)
					.order('date', { ascending: true })
					.order('hour', { ascending: true });

				for (const timeslot of timeslots) {
					for (const hour of timeslot.hours) {
						const targetDay = timeslot.day.toLowerCase();

						const firstMatch = upcomingAppointments?.find(
							(apt) => apt.hour === hour && apt.date && getDayOfWeekFromDate(apt.date) === targetDay
						);

						const timeslotCapacity = firstMatch
							? new Set(
									firstMatch.pe_appointment_trainees.map(
										(t: { trainee_id: string }) => t.trainee_id
									)
								).size
							: 0;

						availableGroupTimeslots.push({
							group_lesson_id: gl.id,
							room_id: gl.room_id || '',
							room_name: gl.pe_rooms?.name || '',
							trainer_id: gl.trainer_id || '',
							trainer_name: gl.pe_trainers?.name || '',
							day: timeslot.day,
							hour: hour,
							max_capacity: maxCapacity,
							current_capacity: timeslotCapacity
						});
					}
				}
			}
		}
	}

	// Get trainees for selected group lesson if specified
	const selectedGroupLessonId = url.searchParams.get('selected_group_lesson_id');
	if (selectedGroupLessonId) {
		// Get all appointments for this group lesson
		const { data: selectedGroupAppts, error: selectedGroupApptsError } = await supabase
			.from('pe_appointments')
			.select('id')
			.eq('group_lesson_id', selectedGroupLessonId);

		if (!selectedGroupApptsError && selectedGroupAppts) {
			const appointmentIds = selectedGroupAppts.map((apt) => apt.id);

			if (appointmentIds.length > 0) {
				const { data: appointmentTrainees, error: traineesError } = await supabase
					.from('pe_appointment_trainees')
					.select('trainee_id')
					.in('appointment_id', appointmentIds);

				if (!traineesError && appointmentTrainees) {
					// Get unique trainee IDs
					const uniqueTrainees = new Set(appointmentTrainees.map((at) => at.trainee_id));
					existingGroupLessonTrainees = Array.from(uniqueTrainees);
				}
			}
		}
	}

	// If we have package details, fetch appointments for the specific date range and room/trainer
	if (packageId && roomId && trainerId && startDateParam && weeksDuration) {
		const start = parseLocalDate(startDateParam);
		// Validate the start date
		if (isNaN(start.getTime())) {
			throw error(400, 'Geçersiz başlangıç tarihi');
		}
		const end = new Date(start);
		end.setDate(start.getDate() + parseInt(weeksDuration) * 7);

		const { data: rangeAppointments, error: appointmentsError } = await supabase
			.from('pe_appointments')
			.select(
				`
				*,
				pe_rooms(id, name),
				pe_trainers(id, name),
				pe_purchases(id, pe_packages(id, name)),
				pe_group_lessons(id, pe_packages(id, name))
			`
			)
			.or(`room_id.eq.${roomId},trainer_id.eq.${trainerId}`)
			.gte('date', formatDateForDB(start))
			.lt('date', formatDateForDB(end));

		if (appointmentsError) {
			throw error(500, 'Randevular yüklenirken hata oluştu: ' + appointmentsError.message);
		}

		appointments = rangeAppointments || [];
	} else if (roomId && trainerId && startDateParam) {
		// If we have room, trainer and start date but not weeks_duration, load with a default range
		// This handles navigation state where duration hasn't been calculated yet
		const start = parseLocalDate(startDateParam);
		// Validate the start date
		if (isNaN(start.getTime())) {
			throw error(400, 'Geçersiz başlangıç tarihi');
		}
		const end = new Date(start);
		end.setDate(start.getDate() + 52 * 7); // Default to 1 year

		const { data: fallbackAppointments, error: appointmentsError } = await supabase
			.from('pe_appointments')
			.select(
				`
				*,
				pe_rooms(id, name),
				pe_trainers(id, name),
				pe_purchases(id, pe_packages(id, name)),
				pe_group_lessons(id, pe_packages(id, name))
			`
			)
			.or(`room_id.eq.${roomId},trainer_id.eq.${trainerId}`)
			.gte('date', formatDateForDB(start))
			.lt('date', formatDateForDB(end));

		if (!appointmentsError) {
			appointments = fallbackAppointments || [];
		}
	}

	return {
		packages: packages || [],
		appointments,
		existingGroupLessons,
		existingGroupLessonTrainees,
		availableGroupTimeslots
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

		let assignmentForm: PackagePurchaseForm;
		try {
			assignmentForm = JSON.parse(assignmentFormJson);
		} catch {
			return fail(400, {
				success: false,
				message: 'Atama verileri geçersiz format'
			});
		}

		// Validate required fields
		if (!assignmentForm.package_id) {
			return fail(400, {
				success: false,
				message: 'Paket seçimi gereklidir'
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

		// Handle private vs group packages differently
		// Priority: selected_group_timeslots > group_lesson_id (joining all timeslots) > new group lesson
		const isJoiningSelectedTimeslots =
			packageData.package_type === 'group' &&
			assignmentForm.selected_group_timeslots &&
			assignmentForm.selected_group_timeslots.length > 0;
		const isJoiningExistingGroupLesson =
			packageData.package_type === 'group' &&
			assignmentForm.group_lesson_id &&
			!isJoiningSelectedTimeslots; // Mutually exclusive with selected timeslots
		const isCreatingNewGroupLesson =
			packageData.package_type === 'group' &&
			!assignmentForm.group_lesson_id &&
			!isJoiningSelectedTimeslots;

		// Validate room, trainer, and time slots (NOT required for joining existing group or selected timeslots)
		if (!isJoiningExistingGroupLesson && !isJoiningSelectedTimeslots) {
			if (
				!assignmentForm.room_id ||
				!assignmentForm.trainer_id ||
				assignmentForm.time_slots.length === 0
			) {
				return fail(400, {
					success: false,
					message: 'Oda, eğitmen ve zaman dilimi seçimi gereklidir'
				});
			}

			// Validate lessons per week (must be between min and max)
			// Only enforce for private packages - new group lessons can have any number of timeslots
			const slotCount = assignmentForm.time_slots.length;
			if (packageData.package_type === 'private') {
				if (
					slotCount < packageData.min_lessons_per_week ||
					slotCount > packageData.max_lessons_per_week
				) {
					const errorMsg =
						packageData.min_lessons_per_week === packageData.max_lessons_per_week
							? `Bu paket için ${packageData.min_lessons_per_week} zaman dilimi seçmelisiniz`
							: `Bu paket için ${packageData.min_lessons_per_week} ile ${packageData.max_lessons_per_week} arası zaman dilimi seçmelisiniz`;
					return fail(400, {
						success: false,
						message: errorMsg
					});
				}
			}
		}

		// Validate selected timeslots for joining per-timeslot
		if (isJoiningSelectedTimeslots) {
			const selectedCount = assignmentForm.selected_group_timeslots!.length;
			if (
				selectedCount < packageData.min_lessons_per_week ||
				selectedCount > packageData.max_lessons_per_week
			) {
				const errorMsg =
					packageData.min_lessons_per_week === packageData.max_lessons_per_week
						? `Bu paket için ${packageData.min_lessons_per_week} zaman dilimi seçmelisiniz`
						: `Bu paket için ${packageData.min_lessons_per_week} ile ${packageData.max_lessons_per_week} arası zaman dilimi seçmelisiniz`;
				return fail(400, {
					success: false,
					message: errorMsg
				});
			}
		}

		// Validate trainee selection for private packages and existing group lessons
		if (packageData.package_type === 'private') {
			if (assignmentForm.trainee_ids.length === 0) {
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
		} else if (isJoiningExistingGroupLesson || isJoiningSelectedTimeslots) {
			if (assignmentForm.trainee_ids.length === 0) {
				return fail(400, {
					success: false,
					message: 'Mevcut grup dersine katılmak için en az bir öğrenci seçmelisiniz'
				});
			}
		}
		// For creating new group lesson, trainee selection is not required

		try {
			// STEP 1: Determine how many weeks of appointments to create
			let weeksToCreate: number;
			let groupLessonId: string | null = null;

			if (isCreatingNewGroupLesson) {
				// For new group lessons, create 26 weeks of appointments
				weeksToCreate = 26;
			} else if (isJoiningExistingGroupLesson) {
				// For joining existing group lesson, use the group_lesson_id from form
				groupLessonId = assignmentForm.group_lesson_id!;
				weeksToCreate = 0; // No new appointments for joining existing
			} else {
				// For private packages, use package duration
				weeksToCreate = packageData.weeks_duration || 1;
			}

			// STEP 2: Check availability for all appointments before creating anything

			// Build all appointment dates/times that will be created
			const allAppointmentSlots: Array<{ date: string; hour: number }> = [];

			for (let week = 0; week < weeksToCreate; week++) {
				for (const slot of assignmentForm.time_slots) {
					// Parse the selected date for this slot
					if (!slot.date) {
						return fail(400, {
							success: false,
							message: 'Zaman dilimi tarih bilgisi eksik'
						});
					}

					const slotDate = parseLocalDate(slot.date);

					// Validate the date is valid
					if (isNaN(slotDate.getTime())) {
						return fail(400, {
							success: false,
							message: `Geçersiz tarih: ${slot.date}`
						});
					}

					// Add week offset
					const appointmentDate = new Date(slotDate);
					appointmentDate.setDate(slotDate.getDate() + week * 7);

					allAppointmentSlots.push({
						date: formatDateForDB(appointmentDate),
						hour: slot.hour
					});
				}
			}

			// Check for conflicts: room and trainer availability are independent —
			// either one being taken blocks the slot
			const conflictService = new ConflictService(supabase);
			const slotConflicts = await conflictService.findSlotConflicts({
				roomId: assignmentForm.room_id,
				trainerId: assignmentForm.trainer_id,
				slots: allAppointmentSlots
			});

			if (slotConflicts.length > 0) {
				const first = slotConflicts[0];
				const dateStr = parseLocalDate(first.date).toLocaleDateString('tr-TR');
				const reason = first.roomConflict ? 'seçilen oda' : 'seçilen eğitmen';
				return fail(400, {
					success: false,
					message: `${dateStr} tarihindeki ${first.hour}:00 zaman dilimi ${reason} için zaten dolu${slotConflicts.length > 1 ? ` (toplam ${slotConflicts.length} çakışma)` : ''}`
				});
			}

			// STEP 2a: Create group lesson entry if creating new group lesson
			if (isCreatingNewGroupLesson) {
				// Calculate start_date as the earliest selected timeslot
				const earliestSlot = allAppointmentSlots.reduce((earliest, slot) => {
					return slot.date < earliest.date ? slot : earliest;
				});

				const startDate = earliestSlot.date;
				const endDate = new Date(startDate);
				endDate.setDate(endDate.getDate() + 26 * 7); // 26 weeks from start

				// Convert time_slots to timeslots JSON format
				const timeslots = assignmentForm.time_slots.map((slot) => ({
					day: slot.day,
					hours: [slot.hour]
				}));

				// Merge hours for same days
				const mergedTimeslots: Record<string, number[]> = {};
				timeslots.forEach((slot) => {
					if (!mergedTimeslots[slot.day]) {
						mergedTimeslots[slot.day] = [];
					}
					mergedTimeslots[slot.day].push(...slot.hours);
				});

				const timeslotsArray = Object.entries(mergedTimeslots).map(([day, hours]) => ({
					day,
					hours: hours.sort((a, b) => a - b)
				}));

				const { data: groupLessonData, error: groupLessonError } = await supabase
					.from('pe_group_lessons')
					.insert({
						package_id: assignmentForm.package_id,
						room_id: assignmentForm.room_id,
						trainer_id: assignmentForm.trainer_id,
						start_date: startDate,
						end_date: null, // Group lessons run indefinitely
						appointments_created_until: formatDateForDB(endDate),
						timeslots: timeslotsArray
					})
					.select('id')
					.single();

				if (groupLessonError) {
					return fail(500, {
						success: false,
						message: 'Grup dersi oluşturulurken hata: ' + groupLessonError.message
					});
				}

				groupLessonId = groupLessonData.id;
			}

			// STEP 2b: Create team and purchase for each trainee (for joining existing group lesson)
			// OR create single team/purchase for private packages
			const traineesPurchases: Array<{ traineeId: string; purchaseId: string; teamId: string }> =
				[];

			if (isJoiningExistingGroupLesson) {
				// For joining existing group: create separate purchase for each trainee
				for (const traineeId of assignmentForm.trainee_ids) {
					const teamId = randomUUID();

					// Create team entry for this trainee
					const { error: teamError } = await supabase.from('pe_teams').insert({
						id: teamId,
						trainee_id: traineeId
					});

					if (teamError) {
						return fail(500, {
							success: false,
							message: `Öğrenci takımı oluşturulurken hata: ${teamError.message}`
						});
					}

					// Create purchase for this trainee
					const rescheduleLeft = packageData.reschedulable
						? (packageData.reschedule_limit ?? 999)
						: 0;

					const { data: purchaseData, error: purchaseError } = await supabase
						.from('pe_purchases')
						.insert({
							package_id: assignmentForm.package_id,
							team_id: teamId,
							reschedule_left: rescheduleLeft,
							successor_id: null
						})
						.select('id')
						.single();

					if (purchaseError) {
						return fail(500, {
							success: false,
							message: `Satın alma oluşturulurken hata: ${purchaseError.message}`
						});
					}

					traineesPurchases.push({
						traineeId,
						purchaseId: purchaseData.id,
						teamId
					});
				}
			} else if (!isCreatingNewGroupLesson && !isJoiningSelectedTimeslots) {
				// For private packages: create single team with all trainees
				const teamId = randomUUID();

				// Save selected trainees to pe_teams table
				const teamInserts = assignmentForm.trainee_ids.map((traineeId) => ({
					id: teamId,
					trainee_id: traineeId
				}));

				const { error: teamError } = await supabase.from('pe_teams').insert(teamInserts);

				if (teamError) {
					return fail(500, {
						success: false,
						message: 'Takım oluşturulurken hata: ' + teamError.message
					});
				}

				// Create single purchase entry
				const rescheduleLeft = packageData.reschedulable
					? (packageData.reschedule_limit ?? 999)
					: 0;

				const { data: purchaseData, error: purchaseError } = await supabase
					.from('pe_purchases')
					.insert({
						package_id: assignmentForm.package_id,
						team_id: teamId,
						reschedule_left: rescheduleLeft,
						successor_id: null
					})
					.select('id')
					.single();

				if (purchaseError) {
					return fail(500, {
						success: false,
						message: 'Satın alma oluşturulurken hata: ' + purchaseError.message
					});
				}

				// All trainees share the same purchase
				for (const traineeId of assignmentForm.trainee_ids) {
					traineesPurchases.push({
						traineeId,
						purchaseId: purchaseData.id,
						teamId
					});
				}
			}

			// STEP 5: Create appointments (only for new lessons, not joining existing)
			let insertedAppointments: Array<{ id: string; date: string; hour: number }> = [];

			if (!isJoiningExistingGroupLesson) {
				// Sort appointment slots by date and hour to ensure correct session numbering
				allAppointmentSlots.sort((a, b) => {
					const dateCompare = a.date.localeCompare(b.date);
					if (dateCompare !== 0) return dateCompare;
					return a.hour - b.hour;
				});

				const appointmentInserts = allAppointmentSlots.map((slot) => ({
					purchase_id: isCreatingNewGroupLesson
						? null
						: traineesPurchases.length > 0
							? traineesPurchases[0].purchaseId
							: null,
					group_lesson_id: isCreatingNewGroupLesson ? groupLessonId : null,
					room_id: assignmentForm.room_id,
					trainer_id: assignmentForm.trainer_id,
					date: slot.date,
					hour: slot.hour
				}));

				const { data: createdAppointments, error: appointmentsError } = await supabase
					.from('pe_appointments')
					.insert(appointmentInserts)
					.select('id, date, hour')
					.order('date, hour');

				if (appointmentsError) {
					return fail(500, {
						success: false,
						message: 'Randevular oluşturulurken hata: ' + appointmentsError.message
					});
				}

				insertedAppointments = createdAppointments || [];
			}

			// STEP 6: Assign trainees to appointments
			if (isJoiningSelectedTimeslots) {
				// For joining specific timeslots from different group lessons
				const now = new Date();
				const todayStr = formatDateForDB(now);
				const currentHour = now.getHours();
				const durationWeeks = assignmentForm.duration_weeks || 4;
				const selectedTimeslots = assignmentForm.selected_group_timeslots!;

				// Create team and purchase for each trainee
				for (const traineeId of assignmentForm.trainee_ids) {
					const teamId = randomUUID();

					// Create team entry for this trainee
					const { error: teamError } = await supabase.from('pe_teams').insert({
						id: teamId,
						trainee_id: traineeId
					});

					if (teamError) {
						return fail(500, {
							success: false,
							message: `Öğrenci takımı oluşturulurken hata: ${teamError.message}`
						});
					}

					// Create purchase for this trainee
					const rescheduleLeft = packageData.reschedulable
						? (packageData.reschedule_limit ?? 999)
						: 0;

					const { data: purchaseData, error: purchaseError } = await supabase
						.from('pe_purchases')
						.insert({
							package_id: assignmentForm.package_id,
							team_id: teamId,
							reschedule_left: rescheduleLeft,
							successor_id: null
						})
						.select('id')
						.single();

					if (purchaseError) {
						return fail(500, {
							success: false,
							message: `Satın alma oluşturulurken hata: ${purchaseError.message}`
						});
					}

					traineesPurchases.push({
						traineeId,
						purchaseId: purchaseData.id,
						teamId
					});
				}

				// Map day names to JS day numbers
				const dayNameToNumber: Record<string, number> = {
					sunday: 0,
					monday: 1,
					tuesday: 2,
					wednesday: 3,
					thursday: 4,
					friday: 5,
					saturday: 6
				};

				// Fetch upcoming appointments for each involved group lesson once. We don't
				// filter by hour: an exact (day, hour) match is required, but the absence of
				// a match (e.g. a canceled or rescheduled slot) just leaves a gap that gets
				// skipped — later weeks fill in to reach the required total.
				const uniqueGroupLessonIds = Array.from(
					new Set(selectedTimeslots.map((t) => t.group_lesson_id))
				);

				const upcomingByGroupLesson = new Map<
					string,
					Array<{ id: number; date: string; hour: number }>
				>();

				for (const groupLessonId of uniqueGroupLessonIds) {
					const { data, error: apptsError } = await supabase
						.from('pe_appointments')
						.select('id, date, hour')
						.eq('group_lesson_id', groupLessonId)
						.gte('date', todayStr)
						.order('date', { ascending: true })
						.order('hour', { ascending: true });

					if (apptsError) {
						return fail(500, {
							success: false,
							message: `Zaman dilimi randevuları alınırken hata: ${apptsError.message}`
						});
					}

					const future: Array<{ id: number; date: string; hour: number }> = [];
					for (const apt of data || []) {
						if (!apt.date || apt.hour === null) continue;
						if (apt.date === todayStr && apt.hour <= currentHour) continue;
						future.push({ id: apt.id, date: apt.date, hour: apt.hour });
					}
					upcomingByGroupLesson.set(groupLessonId, future);
				}

				// Collect exact (day, hour) matches across all selected timeslots, sort
				// chronologically, and take the first totalSessions. Missing/rescheduled
				// slots are skipped; the next matching slots fill in.
				const lessonsPerWeek = selectedTimeslots.length;
				const totalSessions = durationWeeks * lessonsPerWeek;

				const allMatches: Array<{ id: number; date: string; hour: number }> = [];

				for (const timeslot of selectedTimeslots) {
					const targetDayNumber = dayNameToNumber[timeslot.day.toLowerCase()];
					const upcoming = upcomingByGroupLesson.get(timeslot.group_lesson_id) || [];

					for (const apt of upcoming) {
						if (apt.hour !== timeslot.hour) continue;
						if (parseLocalDate(apt.date).getDay() !== targetDayNumber) continue;
						allMatches.push(apt);
					}
				}

				allMatches.sort((a, b) => {
					const dateCompare = a.date.localeCompare(b.date);
					if (dateCompare !== 0) return dateCompare;
					return a.hour - b.hour;
				});

				const collectedAppointments = allMatches.slice(0, totalSessions);

				if (collectedAppointments.length === 0) {
					return fail(400, {
						success: false,
						message: 'Seçilen zaman dilimleri için uygun randevu bulunamadı'
					});
				}

				for (const { traineeId, purchaseId } of traineesPurchases) {
					const appointmentTraineeInserts = collectedAppointments.map((apt, i) => ({
						appointment_id: apt.id,
						trainee_id: traineeId,
						purchase_id: purchaseId,
						session_number: i + 1,
						total_sessions: totalSessions
					}));

					const { error: traineeError } = await supabase
						.from('pe_appointment_trainees')
						.insert(appointmentTraineeInserts);

					if (traineeError) {
						return fail(500, {
							success: false,
							message: 'Öğrenci randevulara atanamadı'
						});
					}
				}

				return {
					success: true,
					message: `${assignmentForm.trainee_ids.length} öğrenci seçilen zaman dilimlerine başarıyla eklendi. Toplam ${collectedAppointments.length} randevuya atandı.`
				};
			} else if (isJoiningExistingGroupLesson) {
				// For joining existing group: get upcoming appointments and assign trainees
				const today = formatDateForDB(new Date());

				// Get upcoming appointments for this group lesson
				const { data: upcomingAppointments, error: appointmentsError } = await supabase
					.from('pe_appointments')
					.select('id, date, hour')
					.eq('group_lesson_id', groupLessonId!)
					.gte('date', today)
					.order('date, hour');

				if (appointmentsError) {
					return fail(500, {
						success: false,
						message: 'Grup dersi randevuları alınırken hata: ' + appointmentsError.message
					});
				}

				if (!upcomingAppointments || upcomingAppointments.length === 0) {
					return fail(400, {
						success: false,
						message: 'Bu grup dersi için gelecek tarihli randevu bulunamadı'
					});
				}

				// Calculate number of appointments each trainee should be assigned to
				// For existing group lessons, use the group lesson's timeslots count
				const durationWeeks = assignmentForm.duration_weeks || 4;

				// Get the group lesson to determine lessons per week
				const { data: groupLessonData } = await supabase
					.from('pe_group_lessons')
					.select('timeslots')
					.eq('id', groupLessonId!)
					.single();

				const timeslots =
					(groupLessonData?.timeslots as Array<{ day: string; hours: number[] }>) || [];
				const lessonsPerWeek = timeslots.reduce((sum, ts) => sum + ts.hours.length, 0);
				const appointmentsPerTrainee = durationWeeks * lessonsPerWeek;

				const appointmentTraineeInserts = [];

				// For each trainee, assign to their appointments
				for (const { traineeId, purchaseId } of traineesPurchases) {
					const traineeAppointments = upcomingAppointments.slice(0, appointmentsPerTrainee);

					for (let i = 0; i < traineeAppointments.length; i++) {
						appointmentTraineeInserts.push({
							appointment_id: traineeAppointments[i].id,
							trainee_id: traineeId,
							purchase_id: purchaseId,
							session_number: i + 1,
							total_sessions: appointmentsPerTrainee
						});
					}
				}

				const { error: traineeError } = await supabase
					.from('pe_appointment_trainees')
					.insert(appointmentTraineeInserts);

				if (traineeError) {
					return fail(500, {
						success: false,
						message: 'Öğrenciler randevulara eklenirken hata: ' + traineeError.message
					});
				}

				return {
					success: true,
					message: `${assignmentForm.trainee_ids.length} öğrenci grup dersine başarıyla eklendi. Her öğrenci ${appointmentsPerTrainee} randevuya atandı.`
				};
			} else if (!isCreatingNewGroupLesson) {
				// For private packages: assign trainees to all created appointments
				// Use the actual number of time slots selected
				const lessonsPerWeek = assignmentForm.time_slots.length;
				const totalSessions = (packageData.weeks_duration || 1) * lessonsPerWeek;

				const appointmentTraineeInserts = [];

				// For each appointment (already sorted by date and hour)
				for (let sessionNumber = 1; sessionNumber <= insertedAppointments.length; sessionNumber++) {
					const appointment = insertedAppointments[sessionNumber - 1];

					// Add all trainees to this appointment with the same session number
					for (const { traineeId, purchaseId } of traineesPurchases) {
						appointmentTraineeInserts.push({
							appointment_id: appointment.id,
							trainee_id: traineeId,
							purchase_id: purchaseId,
							session_number: sessionNumber,
							total_sessions: totalSessions
						});
					}
				}

				const { error: traineeError } = await supabase
					.from('pe_appointment_trainees')
					.insert(appointmentTraineeInserts);

				if (traineeError) {
					return fail(500, {
						success: false,
						message: 'Öğrenciler randevulara eklenirken hata: ' + traineeError.message
					});
				}
			}

			const successMessage = isCreatingNewGroupLesson
				? `Grup dersi başarıyla oluşturuldu. ${insertedAppointments.length} randevu oluşturuldu.`
				: `${insertedAppointments.length} randevu başarıyla oluşturuldu`;

			return {
				success: true,
				message: successMessage
			};
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
