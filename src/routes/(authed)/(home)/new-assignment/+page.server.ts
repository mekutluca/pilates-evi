import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { DayOfWeek } from '$lib/types/Schedule';
import type { PackagePurchaseForm, ExistingGroupLesson, Appointment } from '$lib/types';
import { randomUUID } from 'crypto';
import { getDateForDayOfWeek } from '$lib/utils/date-utils';

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

	let appointments: Appointment[] = [];
	let existingGroupLessons: ExistingGroupLesson[] = [];
	let existingGroupLessonTrainees: string[] = [];

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
			// Transform group lessons into the format expected by the UI
			existingGroupLessons = groupLessons.map((gl) => {
				// Parse timeslots JSON to get day_time_combinations
				const timeslots = gl.timeslots || [];
				const day_time_combinations = Array.isArray(timeslots) ? timeslots : [];

				return {
					group_lesson_id: gl.id,
					package_id: gl.package_id || '',
					room_id: gl.room_id || '',
					room_name: (gl as any).pe_rooms?.name || '',
					trainer_id: gl.trainer_id || '',
					trainer_name: (gl as any).pe_trainers?.name || '',
					max_capacity: (gl as any).pe_packages?.max_capacity || 0,
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
		const start = new Date(startDateParam);
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
			.gte('date', start.toISOString().split('T')[0])
			.lt('date', end.toISOString().split('T')[0]);

		if (appointmentsError) {
			throw error(500, 'Randevular yüklenirken hata oluştu: ' + appointmentsError.message);
		}

		appointments = rangeAppointments || [];
	} else if (roomId && trainerId && startDateParam) {
		// If we have room, trainer and start date but not weeks_duration, load with a default range
		// This handles navigation state where duration hasn't been calculated yet
		const start = new Date(startDateParam);
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
			.gte('date', start.toISOString().split('T')[0])
			.lt('date', end.toISOString().split('T')[0]);

		if (!appointmentsError) {
			appointments = fallbackAppointments || [];
		}
	}

	return {
		packages: packages || [],
		appointments,
		existingGroupLessons,
		existingGroupLessonTrainees
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
		} catch (e) {
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
		const isCreatingNewGroupLesson =
			packageData.package_type === 'group' && !assignmentForm.group_lesson_id;
		const isJoiningExistingGroupLesson =
			packageData.package_type === 'group' && assignmentForm.group_lesson_id;

		// Validate room, trainer, and time slots (NOT required for joining existing group)
		if (!isJoiningExistingGroupLesson) {
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

			// Validate lessons per week
			if (assignmentForm.time_slots.length !== packageData.lessons_per_week) {
				return fail(400, {
					success: false,
					message: `Bu paket için ${packageData.lessons_per_week} zaman dilimi seçmelisiniz`
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
		} else if (isJoiningExistingGroupLesson) {
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

					const slotDate = new Date(slot.date);

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
						date: appointmentDate.toISOString().split('T')[0],
						hour: slot.hour
					});
				}
			}

			// Check for conflicts
			for (const slot of allAppointmentSlots) {
				const { data: conflictingAppointment } = await supabase
					.from('pe_appointments')
					.select('id')
					.eq('room_id', assignmentForm.room_id)
					.eq('trainer_id', assignmentForm.trainer_id)
					.eq('date', slot.date)
					.eq('hour', slot.hour)
					.maybeSingle();

				if (conflictingAppointment) {
					const dateStr = new Date(slot.date).toLocaleDateString('tr-TR');
					return fail(400, {
						success: false,
						message: `${dateStr} tarihindeki ${slot.hour}:00 zaman dilimi seçilen oda ve eğitmen için zaten dolu`
					});
				}
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
						appointments_created_until: endDate.toISOString().split('T')[0],
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
			} else if (!isCreatingNewGroupLesson) {
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
			if (isJoiningExistingGroupLesson) {
				// For joining existing group: get upcoming appointments and assign trainees
				const today = new Date().toISOString().split('T')[0];

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
				const durationWeeks = assignmentForm.duration_weeks || 4;
				const appointmentsPerTrainee = durationWeeks * packageData.lessons_per_week;

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
				const totalSessions = (packageData.weeks_duration || 1) * packageData.lessons_per_week;

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
