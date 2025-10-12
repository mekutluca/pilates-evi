import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { DayOfWeek } from '$lib/types/Schedule';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import {
	findLastPurchaseInChain,
	canExtendPurchase,
	getLastAppointmentDate,
	calculateExtensionStartDate
} from '$lib/utils/extension-utils';

type AppointmentInfo = { room_id: string; trainer_id: string; date: string; hour: number };

// Helper to get appointments for either private or group lessons
async function getAppointmentsForPurchase(
	supabase: SupabaseClient<Database>,
	purchaseId: string,
	limit?: number
): Promise<AppointmentInfo[]> {
	// Try direct purchase_id first (for private lessons)
	const { data: directAppointments } = await supabase
		.from('pe_appointments')
		.select('room_id, trainer_id, date, hour')
		.eq('purchase_id', purchaseId)
		.order('date', { ascending: true })
		.limit(limit || 10);

	if (directAppointments && directAppointments.length > 0) {
		return directAppointments.filter(
			(a): a is AppointmentInfo =>
				a.room_id !== null && a.trainer_id !== null && a.date !== null && a.hour !== null
		);
	}

	// Try via pe_appointment_trainees (for group lessons)
	const { data: traineeAppointments } = await supabase
		.from('pe_appointment_trainees')
		.select('pe_appointments(room_id, trainer_id, date, hour)')
		.eq('purchase_id', purchaseId)
		.order('pe_appointments(date)', { ascending: true })
		.limit(limit || 10);

	if (traineeAppointments && traineeAppointments.length > 0) {
		return traineeAppointments
			.map((t) => (t as { pe_appointments: AppointmentInfo | null }).pe_appointments)
			.filter((a): a is AppointmentInfo => a !== null);
	}

	return [];
}

// Helper to get appointment dates for purchase chain
async function getAppointmentDatesForPurchase(
	supabase: SupabaseClient<Database>,
	purchaseId: string
): Promise<{ start_date: Date | null; end_date: Date | null }> {
	// Try direct purchase_id first
	let { data: appointments } = await supabase
		.from('pe_appointments')
		.select('date')
		.eq('purchase_id', purchaseId)
		.order('date', { ascending: true });

	// If no appointments found, try via pe_appointment_trainees
	if (!appointments || appointments.length === 0) {
		const { data: traineeAppointments } = await supabase
			.from('pe_appointment_trainees')
			.select('pe_appointments(date)')
			.eq('purchase_id', purchaseId)
			.order('pe_appointments(date)', { ascending: true });

		if (traineeAppointments && traineeAppointments.length > 0) {
			appointments = traineeAppointments
				.map((t) => {
					const apt = (t as { pe_appointments: { date: string | null } | null }).pe_appointments;
					return apt?.date ? { date: apt.date } : null;
				})
				.filter((a): a is { date: string } => a !== null);
		}
	}

	let startDate: Date | null = null;
	let endDate: Date | null = null;

	if (appointments && appointments.length > 0) {
		const firstDate = appointments[0].date;
		const lastDate = appointments[appointments.length - 1].date;
		if (firstDate) startDate = new Date(firstDate);
		if (lastDate) endDate = new Date(lastDate);
	}

	return { start_date: startDate, end_date: endDate };
}

export const load: PageServerLoad = async ({ locals: { supabase, user, userRole }, url }) => {
	// Ensure admin and coordinator users can access this page
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	const purchaseId = url.searchParams.get('purchase_id');
	if (!purchaseId) {
		throw error(400, 'Satın alma ID gerekli');
	}

	// Find the last purchase in chain (automatically follows successors)
	const lastPurchase = await findLastPurchaseInChain(supabase, purchaseId);
	if (!lastPurchase) {
		throw error(404, 'Satın alma bulunamadı');
	}

	// Check if the last purchase can be extended
	const extensionCheck = await canExtendPurchase(supabase, lastPurchase.id);
	if (!extensionCheck.canExtend) {
		throw error(400, extensionCheck.reason || 'Bu paket uzatılamaz');
	}

	// Get all purchases in the chain to show the extension history
	const purchaseChain: Array<{ id: string; start_date: Date | null; end_date: Date | null }> = [];
	let currentId: string | null = purchaseId;

	while (currentId) {
		const { data } = await supabase
			.from('pe_purchases')
			.select('id, successor_id')
			.eq('id', currentId)
			.single();

		if (!data) break;

		const chainPurchase: { id: string; successor_id: string | null } = {
			id: data.id,
			successor_id: data.successor_id
		};

		const dates = await getAppointmentDatesForPurchase(supabase, chainPurchase.id);

		purchaseChain.push({
			id: chainPurchase.id,
			...dates
		});

		currentId = chainPurchase.successor_id;
	}

	// Load purchase details with package
	const { data: purchaseData, error: purchaseError } = await supabase
		.from('pe_purchases')
		.select(
			`
			id,
			package_id,
			team_id,
			successor_id,
			pe_packages(
				id,
				name,
				package_type,
				weeks_duration,
				lessons_per_week,
				max_capacity
			)
		`
		)
		.eq('id', lastPurchase.id)
		.single();

	if (purchaseError || !purchaseData) {
		throw error(404, 'Satın alma detayları yüklenemedi');
	}

	// Type the response properly
	type PurchaseWithPackage = {
		id: string;
		package_id: string;
		team_id: string;
		successor_id: string | null;
		pe_packages: {
			id: string;
			name: string;
			package_type: 'private' | 'group';
			weeks_duration: number;
			lessons_per_week: number;
			max_capacity: number;
		} | null;
	};

	const typedPurchase = purchaseData as unknown as PurchaseWithPackage;

	if (!typedPurchase.pe_packages) {
		throw error(404, 'Paket bilgisi bulunamadı');
	}

	// Get trainees from team
	const { data: teamMembers, error: teamError } = await supabase
		.from('pe_teams')
		.select(
			`
			trainee_id,
			pe_trainees(id, name)
		`
		)
		.eq('id', typedPurchase.team_id);

	if (teamError) {
		throw error(500, 'Takım bilgisi yüklenemedi');
	}

	type TeamMemberWithTrainee = {
		trainee_id: string;
		pe_trainees: { id: string; name: string } | null;
	};

	const trainees = (teamMembers as unknown as TeamMemberWithTrainee[])
		.filter((t) => t.pe_trainees)
		.map((t) => ({
			id: t.trainee_id,
			name: t.pe_trainees!.name
		}));

	// Get appointments to determine room, trainer, and time slots
	const appointments = await getAppointmentsForPurchase(supabase, lastPurchase.id);

	if (appointments.length === 0) {
		throw error(404, 'Randevu bilgisi bulunamadı');
	}

	// Get room and trainer names
	const { data: roomData } = await supabase
		.from('pe_rooms')
		.select('id, name')
		.eq('id', appointments[0].room_id)
		.single();

	const { data: trainerData } = await supabase
		.from('pe_trainers')
		.select('id, name')
		.eq('id', appointments[0].trainer_id)
		.single();

	// Extract unique time slots
	const dayMap: Record<number, DayOfWeek> = {
		0: 'sunday',
		1: 'monday',
		2: 'tuesday',
		3: 'wednesday',
		4: 'thursday',
		5: 'friday',
		6: 'saturday'
	};

	const timeSlots: Array<{ day: DayOfWeek; hour: number }> = [];
	const seenSlots = new Set<string>();

	for (const apt of appointments) {
		const date = new Date(apt.date);
		const dayOfWeek = date.getDay();
		const day = dayMap[dayOfWeek];
		const slotKey = `${day}-${apt.hour}`;

		if (!seenSlots.has(slotKey)) {
			seenSlots.add(slotKey);
			timeSlots.push({ day, hour: apt.hour });
		}
	}

	// Calculate suggested start date
	const lastAppDate = await getLastAppointmentDate(supabase, lastPurchase.id);
	const suggestedStartDate = calculateExtensionStartDate(lastAppDate);

	const purchaseInfo = {
		id: lastPurchase.id,
		package_id: typedPurchase.package_id,
		package_name: typedPurchase.pe_packages.name,
		package_type: typedPurchase.pe_packages.package_type,
		weeks_duration: typedPurchase.pe_packages.weeks_duration,
		lessons_per_week: typedPurchase.pe_packages.lessons_per_week,
		max_capacity: typedPurchase.pe_packages.max_capacity,
		trainees,
		room_id: appointments[0].room_id,
		room_name: roomData?.name || '',
		trainer_id: appointments[0].trainer_id,
		trainer_name: trainerData?.name || '',
		time_slots: timeSlots,
		successor_id: typedPurchase.successor_id
	};

	// Format date helper
	const formatLocalDate = (date: Date) => {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	};

	return {
		purchaseInfo,
		suggestedStartDate: formatLocalDate(suggestedStartDate),
		lastAppointmentDate: lastAppDate ? formatLocalDate(new Date(lastAppDate)) : null,
		purchaseChain: purchaseChain.map((p) => ({
			id: p.id,
			start_date: p.start_date ? formatLocalDate(p.start_date) : null,
			end_date: p.end_date ? formatLocalDate(p.end_date) : null
		}))
	};
};

export const actions: Actions = {
	extendPrivate: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, {
				success: false,
				message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
			});
		}

		const formData = await request.formData();
		const purchaseId = formData.get('purchase_id') as string;
		const packageCount = parseInt(formData.get('package_count') as string);

		if (!purchaseId || !packageCount || packageCount < 1) {
			return fail(400, {
				success: false,
				message: 'Geçersiz form verileri'
			});
		}

		// Find the last purchase in the chain
		const lastPurchase = await findLastPurchaseInChain(supabase, purchaseId);
		if (!lastPurchase) {
			return fail(404, {
				success: false,
				message: 'Satın alma bulunamadı'
			});
		}

		// Load purchase details
		const { data: purchaseData, error: purchaseError } = await supabase
			.from('pe_purchases')
			.select(
				`
				id,
				package_id,
				team_id,
				reschedule_left,
				pe_packages(
					id,
					package_type,
					weeks_duration,
					lessons_per_week,
					reschedulable,
					reschedule_limit
				)
			`
			)
			.eq('id', lastPurchase.id)
			.single();

		if (purchaseError || !purchaseData) {
			return fail(404, {
				success: false,
				message: 'Satın alma detayları yüklenemedi'
			});
		}

		type PurchaseWithPackage = {
			id: string;
			package_id: string;
			team_id: string;
			reschedule_left: number;
			pe_packages: {
				id: string;
				package_type: 'private' | 'group';
				weeks_duration: number;
				lessons_per_week: number;
				reschedulable: boolean;
				reschedule_limit: number | null;
			} | null;
		};

		const typedPurchase = purchaseData as unknown as PurchaseWithPackage;

		if (!typedPurchase.pe_packages) {
			return fail(404, {
				success: false,
				message: 'Paket bilgisi bulunamadı'
			});
		}

		const packageInfo = typedPurchase.pe_packages;

		// Get appointments to determine room, trainer, and time slots
		const { data: appointments, error: appointmentsError } = await supabase
			.from('pe_appointments')
			.select('room_id, trainer_id, date, hour')
			.eq('purchase_id', lastPurchase.id)
			.order('date', { ascending: true })
			.limit(10);

		if (appointmentsError || !appointments || appointments.length === 0) {
			return fail(404, {
				success: false,
				message: 'Randevu bilgisi bulunamadı'
			});
		}

		// Extract time slots
		const dayMap: Record<number, DayOfWeek> = {
			0: 'sunday',
			1: 'monday',
			2: 'tuesday',
			3: 'wednesday',
			4: 'thursday',
			5: 'friday',
			6: 'saturday'
		};

		const timeSlots: Array<{ day: DayOfWeek; hour: number; date: string }> = [];
		const seenSlots = new Set<string>();

		for (const apt of appointments) {
			const date = new Date(apt.date);
			const dayOfWeek = date.getDay();
			const day = dayMap[dayOfWeek];
			const slotKey = `${day}-${apt.hour}`;

			if (!seenSlots.has(slotKey)) {
				seenSlots.add(slotKey);
				timeSlots.push({ day, hour: apt.hour, date: apt.date });
			}
		}

		// Calculate start date for extension
		const lastAppDate = await getLastAppointmentDate(supabase, lastPurchase.id);
		let currentStartDate = calculateExtensionStartDate(lastAppDate);

		// For private lessons, create separate purchases for each package
		// For group lessons, create one purchase with all appointments
		const isPrivate = packageInfo.package_type === 'private';
		const purchasesToCreate = isPrivate ? packageCount : 1;
		const weeksPerPurchase = packageInfo.weeks_duration;
		const totalWeeksForGroupLesson = isPrivate ? weeksPerPurchase : weeksPerPurchase * packageCount;

		// Helper function to build appointment slots for a given number of weeks
		const buildAppointmentSlots = (
			startDate: Date,
			numWeeks: number
		): Array<{ date: string; hour: number }> => {
			const slots: Array<{ date: string; hour: number }> = [];

			for (let week = 0; week < numWeeks; week++) {
				for (const slot of timeSlots) {
					const weekStart = new Date(startDate);
					weekStart.setDate(startDate.getDate() + week * 7);

					// Calculate the actual date for this day
					const dayIndex = {
						sunday: 0,
						monday: 1,
						tuesday: 2,
						wednesday: 3,
						thursday: 4,
						friday: 5,
						saturday: 6
					}[slot.day];

					const weekStartDay = weekStart.getDay();
					let daysToAdd = dayIndex - weekStartDay;
					if (daysToAdd < 0) daysToAdd += 7;

					const slotDate = new Date(weekStart);
					slotDate.setDate(weekStart.getDate() + daysToAdd);

					const year = slotDate.getFullYear();
					const month = String(slotDate.getMonth() + 1).padStart(2, '0');
					const day = String(slotDate.getDate()).padStart(2, '0');
					const dateString = `${year}-${month}-${day}`;

					slots.push({
						date: dateString,
						hour: slot.hour
					});
				}
			}

			return slots;
		};

		// Build all appointments to check for conflicts upfront
		const allAppointmentSlots = buildAppointmentSlots(
			currentStartDate,
			isPrivate ? weeksPerPurchase * packageCount : totalWeeksForGroupLesson
		);

		// Check for conflicts before creating any purchases
		for (const slot of allAppointmentSlots) {
			const { data: conflictingAppointment } = await supabase
				.from('pe_appointments')
				.select('id')
				.eq('room_id', appointments[0].room_id)
				.eq('trainer_id', appointments[0].trainer_id)
				.eq('date', slot.date)
				.eq('hour', slot.hour)
				.maybeSingle();

			if (conflictingAppointment) {
				const dateStr = new Date(slot.date).toLocaleDateString('tr-TR');
				return fail(400, {
					success: false,
					message: `${dateStr} tarihindeki ${slot.hour}:00 zaman dilimi zaten dolu`
				});
			}
		}

		// Get trainees from team
		const { data: teamMembers, error: teamError } = await supabase
			.from('pe_teams')
			.select('trainee_id')
			.eq('id', typedPurchase.team_id);

		if (teamError || !teamMembers) {
			return fail(500, {
				success: false,
				message: 'Takım üyeleri alınamadı'
			});
		}

		const rescheduleLeft = packageInfo.reschedulable ? (packageInfo.reschedule_limit ?? 999) : 0;

		// Create purchases and appointments
		let previousPurchaseId = lastPurchase.id;
		let totalAppointmentsCreated = 0;

		for (let i = 0; i < purchasesToCreate; i++) {
			// Create purchase
			const { data: newPurchase, error: newPurchaseError } = await supabase
				.from('pe_purchases')
				.insert({
					package_id: typedPurchase.package_id,
					team_id: typedPurchase.team_id,
					reschedule_left: rescheduleLeft,
					successor_id: null
				})
				.select('id')
				.single();

			if (newPurchaseError || !newPurchase) {
				return fail(500, {
					success: false,
					message: `Satın alma ${i + 1} oluşturulamadı`
				});
			}

			// Update previous purchase to point to new purchase
			const { error: updateError } = await supabase
				.from('pe_purchases')
				.update({ successor_id: newPurchase.id })
				.eq('id', previousPurchaseId);

			if (updateError) {
				return fail(500, {
					success: false,
					message: 'Satın alma zinciri güncellenemedi'
				});
			}

			// Get appointment slots for this purchase
			const numWeeks = isPrivate ? weeksPerPurchase : totalWeeksForGroupLesson;
			const purchaseSlots = buildAppointmentSlots(currentStartDate, numWeeks);

			// Sort by date and hour
			purchaseSlots.sort((a, b) => {
				const dateCompare = a.date.localeCompare(b.date);
				if (dateCompare !== 0) return dateCompare;
				return a.hour - b.hour;
			});

			// Create appointments for this purchase
			const appointmentInserts = purchaseSlots.map((slot) => ({
				purchase_id: newPurchase.id,
				room_id: appointments[0].room_id,
				trainer_id: appointments[0].trainer_id,
				date: slot.date,
				hour: slot.hour
			}));

			const { data: createdAppointments, error: appointmentsInsertError } = await supabase
				.from('pe_appointments')
				.insert(appointmentInserts)
				.select('id, date, hour')
				.order('date, hour');

			if (appointmentsInsertError || !createdAppointments) {
				return fail(500, {
					success: false,
					message: `Randevular oluşturulamadı (paket ${i + 1})`
				});
			}

			// Assign trainees to appointments
			const totalSessions = numWeeks * packageInfo.lessons_per_week;
			const appointmentTraineeInserts = [];

			for (let sessionNumber = 1; sessionNumber <= createdAppointments.length; sessionNumber++) {
				const appointment = createdAppointments[sessionNumber - 1];

				for (const member of teamMembers) {
					appointmentTraineeInserts.push({
						appointment_id: appointment.id,
						trainee_id: member.trainee_id,
						purchase_id: newPurchase.id,
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
					message: `Öğrenciler randevulara eklenemedi (paket ${i + 1})`
				});
			}

			totalAppointmentsCreated += createdAppointments.length;
			previousPurchaseId = newPurchase.id;

			// For private lessons, update start date for next purchase
			if (isPrivate) {
				// Get the last appointment date of this purchase and calculate next start
				const lastSlotDate = purchaseSlots[purchaseSlots.length - 1].date;
				const [year, month, day] = lastSlotDate.split('-').map(Number);
				const lastDate = new Date(year, month - 1, day);
				currentStartDate = calculateExtensionStartDate(lastDate);
			}
		}

		return {
			success: true,
			message: `${packageCount} paket (${totalAppointmentsCreated} randevu) başarıyla oluşturuldu`
		};
	},

	extendGroup: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, {
				success: false,
				message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
			});
		}

		const formData = await request.formData();
		const purchaseId = formData.get('purchase_id') as string;
		const assignmentWeeksStr = formData.get('assignment_weeks') as string;

		if (!purchaseId || !assignmentWeeksStr) {
			return fail(400, {
				success: false,
				message: 'Gerekli parametreler eksik'
			});
		}

		const assignmentWeeks = parseInt(assignmentWeeksStr);
		if (isNaN(assignmentWeeks) || assignmentWeeks < 1) {
			return fail(400, {
				success: false,
				message: 'Geçersiz hafta sayısı'
			});
		}

		// Find the last purchase in the chain
		const lastPurchase = await findLastPurchaseInChain(supabase, purchaseId);
		if (!lastPurchase) {
			return fail(404, {
				success: false,
				message: 'Satın alma bulunamadı'
			});
		}

		// Load purchase details
		const { data: purchaseData, error: purchaseError } = await supabase
			.from('pe_purchases')
			.select(
				`
				id,
				package_id,
				team_id,
				reschedule_left,
				pe_packages(
					id,
					package_type,
					weeks_duration,
					lessons_per_week,
					reschedulable,
					reschedule_limit
				)
			`
			)
			.eq('id', lastPurchase.id)
			.single();

		if (purchaseError || !purchaseData) {
			return fail(404, {
				success: false,
				message: 'Satın alma detayları yüklenemedi'
			});
		}

		type PurchaseWithPackage = {
			id: string;
			package_id: string;
			team_id: string;
			reschedule_left: number;
			pe_packages: {
				id: string;
				package_type: 'private' | 'group';
				weeks_duration: number;
				lessons_per_week: number;
				reschedulable: boolean;
				reschedule_limit: number | null;
			} | null;
		};

		const typedPurchase = purchaseData as unknown as PurchaseWithPackage;

		if (!typedPurchase.pe_packages) {
			return fail(404, {
				success: false,
				message: 'Paket bilgisi bulunamadı'
			});
		}

		// Verify this is a group package
		if (typedPurchase.pe_packages.package_type !== 'group') {
			return fail(400, {
				success: false,
				message: 'Bu işlem sadece grup dersleri için geçerlidir'
			});
		}

		const packageInfo = typedPurchase.pe_packages;

		// Get appointments via pe_appointment_trainees (for group lessons)
		const { data: traineeAppointments, error: traineeAppError } = await supabase
			.from('pe_appointment_trainees')
			.select('pe_appointments(id, room_id, trainer_id, date, hour, group_lesson_id)')
			.eq('purchase_id', lastPurchase.id)
			.order('pe_appointments(date)', { ascending: true })
			.limit(10);

		type TraineeAppointmentData = {
			pe_appointments: {
				id: string;
				room_id: string;
				trainer_id: string;
				date: string;
				hour: number;
				group_lesson_id: string;
			} | null;
		};

		const appointments: AppointmentInfo[] = [];
		let groupLessonId: string | null = null;

		if (traineeAppointments && traineeAppointments.length > 0) {
			const typedAppointments = traineeAppointments as TraineeAppointmentData[];

			for (const t of typedAppointments) {
				if (t.pe_appointments) {
					appointments.push({
						room_id: t.pe_appointments.room_id,
						trainer_id: t.pe_appointments.trainer_id,
						date: t.pe_appointments.date,
						hour: t.pe_appointments.hour
					});

					if (!groupLessonId) {
						groupLessonId = t.pe_appointments.group_lesson_id;
					}
				}
			}
		}

		if (appointments.length === 0) {
			let errorMessage = `Randevu bilgisi bulunamadı. Purchase ID: ${lastPurchase.id}`;
			if (traineeAppError) {
				errorMessage += ` | DB Error: ${traineeAppError.message}`;
			} else if (!traineeAppointments || traineeAppointments.length === 0) {
				errorMessage += ' | Bu purchase için hiç appointment_trainee kaydı bulunamadı.';
			}

			return fail(404, {
				success: false,
				message: errorMessage
			});
		}

		if (!groupLessonId) {
			return fail(404, {
				success: false,
				message: 'Grup dersi ID bulunamadı'
			});
		}

		// Extract time slots
		const dayMap: Record<number, DayOfWeek> = {
			0: 'sunday',
			1: 'monday',
			2: 'tuesday',
			3: 'wednesday',
			4: 'thursday',
			5: 'friday',
			6: 'saturday'
		};

		const timeSlots: Array<{ day: DayOfWeek; hour: number }> = [];
		const seenSlots = new Set<string>();

		for (const apt of appointments) {
			const date = new Date(apt.date);
			const dayOfWeek = date.getDay();
			const day = dayMap[dayOfWeek];
			const slotKey = `${day}-${apt.hour}`;

			if (!seenSlots.has(slotKey)) {
				seenSlots.add(slotKey);
				timeSlots.push({ day, hour: apt.hour });
			}
		}

		// Calculate start date for extension
		const lastAppDate = await getLastAppointmentDate(supabase, lastPurchase.id);
		const currentStartDate = calculateExtensionStartDate(lastAppDate);

		// For group lessons, create one purchase with specified weeks
		const numWeeks = assignmentWeeks;

		// Helper function to build appointment slots
		const buildAppointmentSlots = (
			startDate: Date,
			numWeeks: number
		): Array<{ date: string; hour: number }> => {
			const slots: Array<{ date: string; hour: number }> = [];

			for (let week = 0; week < numWeeks; week++) {
				for (const slot of timeSlots) {
					const weekStart = new Date(startDate);
					weekStart.setDate(startDate.getDate() + week * 7);

					const dayIndex = {
						sunday: 0,
						monday: 1,
						tuesday: 2,
						wednesday: 3,
						thursday: 4,
						friday: 5,
						saturday: 6
					}[slot.day];

					const weekStartDay = weekStart.getDay();
					let daysToAdd = dayIndex - weekStartDay;
					if (daysToAdd < 0) daysToAdd += 7;

					const slotDate = new Date(weekStart);
					slotDate.setDate(weekStart.getDate() + daysToAdd);

					const year = slotDate.getFullYear();
					const month = String(slotDate.getMonth() + 1).padStart(2, '0');
					const day = String(slotDate.getDate()).padStart(2, '0');
					const dateString = `${year}-${month}-${day}`;

					slots.push({
						date: dateString,
						hour: slot.hour
					});
				}
			}

			return slots;
		};

		// Build all appointment slots
		const allAppointmentSlots = buildAppointmentSlots(currentStartDate, numWeeks);

		// Get trainee from team (should be one trainee for group lesson extension)
		const { data: teamMembers, error: teamError } = await supabase
			.from('pe_teams')
			.select('trainee_id')
			.eq('id', typedPurchase.team_id);

		if (teamError || !teamMembers || teamMembers.length === 0) {
			return fail(500, {
				success: false,
				message: 'Takım üyeleri alınamadı'
			});
		}

		const rescheduleLeft = packageInfo.reschedulable ? (packageInfo.reschedule_limit ?? 999) : 0;

		// Create new purchase
		const { data: newPurchase, error: newPurchaseError } = await supabase
			.from('pe_purchases')
			.insert({
				package_id: typedPurchase.package_id,
				team_id: typedPurchase.team_id,
				reschedule_left: rescheduleLeft,
				successor_id: null
			})
			.select('id')
			.single();

		if (newPurchaseError || !newPurchase) {
			return fail(500, {
				success: false,
				message: 'Satın alma oluşturulamadı'
			});
		}

		// Update previous purchase to point to new purchase
		const { error: updateError } = await supabase
			.from('pe_purchases')
			.update({ successor_id: newPurchase.id })
			.eq('id', lastPurchase.id);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Satın alma zinciri güncellenemedi'
			});
		}

		// groupLessonId was already obtained earlier when fetching appointments

		// Find matching appointments to join
		const appointmentTraineeInserts = [];
		let totalSessionsJoined = 0;

		for (let sessionNumber = 1; sessionNumber <= allAppointmentSlots.length; sessionNumber++) {
			const slot = allAppointmentSlots[sessionNumber - 1];

			// Find the appointment that matches this slot
			const { data: matchingAppointment } = await supabase
				.from('pe_appointments')
				.select('id')
				.eq('group_lesson_id', groupLessonId)
				.eq('date', slot.date)
				.eq('hour', slot.hour)
				.maybeSingle();

			if (matchingAppointment) {
				for (const member of teamMembers) {
					appointmentTraineeInserts.push({
						appointment_id: matchingAppointment.id,
						trainee_id: member.trainee_id,
						purchase_id: newPurchase.id,
						session_number: sessionNumber,
						total_sessions: allAppointmentSlots.length
					});
				}
				totalSessionsJoined++;
			}
		}

		if (appointmentTraineeInserts.length === 0) {
			return fail(404, {
				success: false,
				message: 'Katılınacak randevu bulunamadı'
			});
		}

		const { error: traineeError } = await supabase
			.from('pe_appointment_trainees')
			.insert(appointmentTraineeInserts);

		if (traineeError) {
			return fail(500, {
				success: false,
				message: 'Öğrenciler randevulara eklenemedi'
			});
		}

		return {
			success: true,
			message: `${assignmentWeeks} haftalık uzatma (${totalSessionsJoined} derse katılım) başarıyla oluşturuldu`
		};
	}
};
