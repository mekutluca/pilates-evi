import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type {
	PackagePurchaseForm,
	ExistingGroupLesson,
	Appointment,
	AvailableGroupTimeslot,
	GroupLessonQueryResult
} from '$lib/types';
import { parseLocalDate, getDayOfWeekFromDate, formatDateForDB } from '$lib/utils/date-utils';
import { isNonNull } from '$lib/utils/type-guards';
import { ConflictService } from '$lib/server/services/conflict-service';
import { SchedulingService } from '$lib/server/services/scheduling-service';
import type {
	AssignmentGroupLessonPayload,
	AssignmentPurchasePayload,
	AssignmentAppointmentPayload,
	AssignmentEnrollmentPayload
} from '$lib/types/Assignment';
import { isValidUuid } from '$lib/utils/validation';
import { requireStaff } from '$lib/server/permissions';

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
	const {
		packages: allPackages,
		rooms: allRooms,
		trainers: allTrainers,
		trainees: allTrainees
	} = await parent();
	const packages = allPackages
		.filter((pkg) => pkg.is_active !== false)
		.sort((a, b) => a.name.localeCompare(b.name));
	const rooms = allRooms.filter((r) => r.is_active);
	const trainers = allTrainers.filter((t) => t.is_active);
	const trainees = allTrainees.filter((t) => t.is_active);

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

			// Get current capacity for each group lesson using appointment_trainees.
			// Two batched queries for all lessons instead of two per lesson.
			const lessonIds = existingGroupLessons.map((gl) => gl.group_lesson_id);
			const { data: lessonAppointments } = await supabase
				.from('pe_appointments')
				.select('id, group_lesson_id')
				.in('group_lesson_id', lessonIds);

			const lessonByAppointment = new Map(
				(lessonAppointments ?? []).map((apt) => [apt.id, apt.group_lesson_id])
			);

			if (lessonByAppointment.size > 0) {
				const { data: lessonEnrollments } = await supabase
					.from('pe_appointment_trainees')
					.select('appointment_id, trainee_id')
					.in('appointment_id', [...lessonByAppointment.keys()]);

				const traineesByLesson = new Map<string, Set<string>>();
				for (const enrollment of lessonEnrollments ?? []) {
					if (enrollment.appointment_id === null || !enrollment.trainee_id) continue;
					const lessonId = lessonByAppointment.get(enrollment.appointment_id);
					if (!lessonId) continue;
					let set = traineesByLesson.get(lessonId);
					if (!set) {
						set = new Set<string>();
						traineesByLesson.set(lessonId, set);
					}
					set.add(enrollment.trainee_id);
				}

				for (const groupLesson of existingGroupLessons) {
					groupLesson.current_capacity =
						traineesByLesson.get(groupLesson.group_lesson_id)?.size ?? 0;
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
									firstMatch.pe_appointment_trainees.map((t) => t.trainee_id).filter(isNonNull)
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
					const uniqueTrainees = new Set(
						appointmentTrainees.map((at) => at.trainee_id).filter(isNonNull)
					);
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
		rooms,
		trainers,
		trainees,
		appointments,
		existingGroupLessons,
		existingGroupLessonTrainees,
		availableGroupTimeslots
	};
};

export const actions: Actions = {
	createAssignment: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

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

			// Build the transactional payload — nothing is written until the single
			// SchedulingService.createAssignment call at the end, so a failure
			// anywhere leaves no orphan rows.
			const rescheduleLeft = packageData.reschedulable ? (packageData.reschedule_limit ?? 999) : 0;
			let groupLessonPayload: AssignmentGroupLessonPayload | null = null;
			const purchases: AssignmentPurchasePayload[] = [];
			const newAppointments: AssignmentAppointmentPayload[] = [];
			const enrollments: AssignmentEnrollmentPayload[] = [];
			let successMessage: string;

			// Sort slots chronologically — session numbering follows array order
			allAppointmentSlots.sort((a, b) => {
				const dateCompare = a.date.localeCompare(b.date);
				if (dateCompare !== 0) return dateCompare;
				return a.hour - b.hour;
			});

			if (isCreatingNewGroupLesson) {
				// start_date is the earliest selected timeslot (slots are sorted)
				const startDate = allAppointmentSlots[0].date;
				const endDate = parseLocalDate(startDate);
				endDate.setDate(endDate.getDate() + 26 * 7); // 26 weeks from start

				// Merge hours of same days into the timeslots JSON shape
				const mergedTimeslots: Record<string, number[]> = {};
				for (const slot of assignmentForm.time_slots) {
					if (!mergedTimeslots[slot.day]) mergedTimeslots[slot.day] = [];
					mergedTimeslots[slot.day].push(slot.hour);
				}
				const timeslotsArray = Object.entries(mergedTimeslots).map(([day, hours]) => ({
					day,
					hours: hours.sort((a, b) => a - b)
				}));

				groupLessonPayload = {
					package_id: assignmentForm.package_id,
					room_id: assignmentForm.room_id,
					trainer_id: assignmentForm.trainer_id,
					start_date: startDate,
					appointments_created_until: formatDateForDB(endDate),
					timeslots: timeslotsArray
				};

				newAppointments.push(
					...allAppointmentSlots.map((slot, i) => ({
						key: String(i),
						room_id: assignmentForm.room_id,
						trainer_id: assignmentForm.trainer_id,
						date: slot.date,
						hour: slot.hour,
						in_group: true
					}))
				);

				successMessage = `Grup dersi başarıyla oluşturuldu. ${newAppointments.length} randevu oluşturuldu.`;
			} else if (isJoiningSelectedTimeslots) {
				// Joining specific timeslots from (possibly several) group lessons
				const now = new Date();
				const todayStr = formatDateForDB(now);
				const currentHour = now.getHours();
				const durationWeeks = assignmentForm.duration_weeks || 4;
				const selectedTimeslots = assignmentForm.selected_group_timeslots!;

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

				for (const lessonId of uniqueGroupLessonIds) {
					const { data, error: apptsError } = await supabase
						.from('pe_appointments')
						.select('id, date, hour')
						.eq('group_lesson_id', lessonId)
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
						if (apt.date === todayStr && apt.hour <= currentHour) continue;
						future.push({ id: apt.id, date: apt.date, hour: apt.hour });
					}
					upcomingByGroupLesson.set(lessonId, future);
				}

				// Collect exact (day, hour) matches across all selected timeslots, sort
				// chronologically, and take the first totalSessions. Missing/rescheduled
				// slots are skipped; the next matching slots fill in.
				const lessonsPerWeek = selectedTimeslots.length;
				const totalSessions = durationWeeks * lessonsPerWeek;

				const allMatches: Array<{ id: number; date: string; hour: number }> = [];

				for (const timeslot of selectedTimeslots) {
					const targetDay = timeslot.day.toLowerCase();
					const upcoming = upcomingByGroupLesson.get(timeslot.group_lesson_id) || [];

					for (const apt of upcoming) {
						if (apt.hour !== timeslot.hour) continue;
						if (getDayOfWeekFromDate(apt.date) !== targetDay) continue;
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

				const enrollmentCheck = await conflictService.checkEnrollmentTargets({
					appointmentIds: collectedAppointments.map((apt) => apt.id),
					traineeIds: assignmentForm.trainee_ids
				});
				if (enrollmentCheck.duplicates.length > 0) {
					return fail(400, {
						success: false,
						message: 'Seçilen öğrencilerden en az biri bu randevulara zaten kayıtlı'
					});
				}
				if (enrollmentCheck.overCapacity.length > 0) {
					return fail(400, {
						success: false,
						message: 'Seçilen zaman dilimlerinde yeterli kapasite yok'
					});
				}

				// One purchase (with its own team) per trainee; enroll each into the
				// collected appointments
				for (const traineeId of assignmentForm.trainee_ids) {
					purchases.push({
						key: traineeId,
						package_id: assignmentForm.package_id,
						reschedule_left: rescheduleLeft,
						trainee_ids: [traineeId]
					});
					enrollments.push(
						...collectedAppointments.map((apt, i) => ({
							purchase_key: traineeId,
							trainee_id: traineeId,
							appointment_id: apt.id,
							session_number: i + 1,
							total_sessions: totalSessions
						}))
					);
				}

				successMessage = `${assignmentForm.trainee_ids.length} öğrenci seçilen zaman dilimlerine başarıyla eklendi. Toplam ${collectedAppointments.length} randevuya atandı.`;
			} else if (isJoiningExistingGroupLesson) {
				// Joining an existing group lesson: enroll into its upcoming appointments
				const today = formatDateForDB(new Date());

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

				// Number of appointments per trainee follows the lesson's weekly slot count
				const durationWeeks = assignmentForm.duration_weeks || 4;

				const { data: groupLessonData } = await supabase
					.from('pe_group_lessons')
					.select('timeslots')
					.eq('id', groupLessonId!)
					.single();

				const timeslots =
					(groupLessonData?.timeslots as Array<{ day: string; hours: number[] }>) || [];
				const lessonsPerWeek = timeslots.reduce((sum, ts) => sum + ts.hours.length, 0);
				const appointmentsPerTrainee = durationWeeks * lessonsPerWeek;

				const targetAppointments = upcomingAppointments.slice(0, appointmentsPerTrainee);
				const enrollmentCheck = await conflictService.checkEnrollmentTargets({
					appointmentIds: targetAppointments.map((apt) => apt.id),
					traineeIds: assignmentForm.trainee_ids
				});
				if (enrollmentCheck.duplicates.length > 0) {
					return fail(400, {
						success: false,
						message: 'Seçilen öğrencilerden en az biri bu grup dersine zaten kayıtlı'
					});
				}
				if (enrollmentCheck.overCapacity.length > 0) {
					return fail(400, {
						success: false,
						message: 'Grup dersinde yeterli kapasite yok'
					});
				}

				// One purchase (with its own team) per trainee
				for (const traineeId of assignmentForm.trainee_ids) {
					purchases.push({
						key: traineeId,
						package_id: assignmentForm.package_id,
						reschedule_left: rescheduleLeft,
						trainee_ids: [traineeId]
					});
					enrollments.push(
						...targetAppointments.map((apt, i) => ({
							purchase_key: traineeId,
							trainee_id: traineeId,
							appointment_id: apt.id,
							session_number: i + 1,
							total_sessions: appointmentsPerTrainee
						}))
					);
				}

				successMessage = `${assignmentForm.trainee_ids.length} öğrenci grup dersine başarıyla eklendi. Her öğrenci ${appointmentsPerTrainee} randevuya atandı.`;
			} else {
				// Private package: one shared team + purchase, new appointments, all
				// trainees enrolled in every appointment
				const lessonsPerWeek = assignmentForm.time_slots.length;
				const totalSessions = (packageData.weeks_duration || 1) * lessonsPerWeek;

				purchases.push({
					key: 'main',
					package_id: assignmentForm.package_id,
					reschedule_left: rescheduleLeft,
					trainee_ids: assignmentForm.trainee_ids
				});

				allAppointmentSlots.forEach((slot, i) => {
					newAppointments.push({
						key: String(i),
						room_id: assignmentForm.room_id,
						trainer_id: assignmentForm.trainer_id,
						date: slot.date,
						hour: slot.hour,
						purchase_key: 'main'
					});
					enrollments.push(
						...assignmentForm.trainee_ids.map((traineeId) => ({
							purchase_key: 'main',
							trainee_id: traineeId,
							appointment_key: String(i),
							session_number: i + 1,
							total_sessions: totalSessions
						}))
					);
				});

				successMessage = `${newAppointments.length} randevu başarıyla oluşturuldu`;
			}

			await new SchedulingService(supabase).createAssignment({
				groupLesson: groupLessonPayload,
				purchases,
				appointments: newAppointments,
				enrollments
			});

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
