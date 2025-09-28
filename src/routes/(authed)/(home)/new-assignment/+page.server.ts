import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { PackagePurchaseForm } from '$lib/types/Package';
import type {
	AppointmentWithRelations,
	ExistingPurchaseSeries,
	PurchaseTraineeData,
	AppointmentSeriesData,
	ProcessedPurchaseData
} from '$lib/types/Schedule';
import type { TimeSlotPattern, DayOfWeek } from '$lib/types/Schedule';
import { randomUUID } from 'crypto';
import { getDateForDayOfWeek } from '$lib/utils/date-utils';

// Helper function to process appointment series data for purchase-based system
function processAppointmentSeries(
	seriesData: AppointmentSeriesData[],
	packageId?: string
): ExistingPurchaseSeries[] {
	const purchaseMap = new Map<string | number, ProcessedPurchaseData>();

	seriesData?.forEach((appointment) => {
		const purchaseId = appointment.purchase_id;
		const packageIdFromData = appointment.pe_purchases?.pe_packages?.id;

		if (!purchaseId) return; // Skip if no purchase ID

		const key = packageId ? purchaseId : `${purchaseId}-${packageIdFromData}`;

		if (!purchaseMap.has(key)) {
			// Calculate current capacity (active trainees)
			const activeTrainees =
				appointment.pe_purchases?.pe_purchase_trainees?.filter(
					(pt: PurchaseTraineeData) => !pt.end_date || new Date(pt.end_date) > new Date()
				) || [];
			const currentCapacity = activeTrainees.length;

			purchaseMap.set(key, {
				purchase_id: purchaseId,
				package_id: packageId ? parseInt(packageId) : packageIdFromData!,
				room_name: appointment.pe_purchases?.pe_rooms?.name,
				trainer_name: appointment.pe_purchases?.pe_trainers?.name,
				current_capacity: currentCapacity,
				max_capacity: appointment.pe_purchases?.pe_packages?.max_capacity || 0,
				day_time_slots: new Map<number, Set<number>>()
			});
		}

		const purchase = purchaseMap.get(key)!;

		// Track day-time combinations
		const dayOfWeek = new Date(appointment.appointment_date).getDay();
		if (!purchase.day_time_slots.has(dayOfWeek)) {
			purchase.day_time_slots.set(dayOfWeek, new Set<number>());
		}
		purchase.day_time_slots.get(dayOfWeek)!.add(appointment.hour);
	});

	// Convert day_time_slots Map to array and format the data
	return Array.from(purchaseMap.values()).map((purchase) => {
		const dayTimeCombinations: Array<{ day: number; hours: number[] }> = [];
		for (const [day, hours] of purchase.day_time_slots.entries()) {
			dayTimeCombinations.push({
				day: day,
				hours: Array.from(hours).sort()
			});
		}
		return {
			purchase_id: purchase.purchase_id,
			package_id: purchase.package_id,
			room_name: purchase.room_name || 'Belirtilmemiş',
			trainer_name: purchase.trainer_name || 'Belirtilmemiş',
			current_capacity: purchase.current_capacity,
			max_capacity: purchase.max_capacity,
			day_time_combinations: dayTimeCombinations
		};
	});
}

// Helper function to get appointment series query string
function getAppointmentSeriesQuery(): string {
	return `
		series_id,
		purchase_id,
		pe_purchases!inner(
			id,
			pe_packages!inner(id, name, max_capacity),
			pe_purchase_trainees(pe_trainees(id), end_date),
			pe_rooms(id, name),
			pe_trainers(id, name)
		),
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
		pe_purchases!inner(
			id,
			room_id,
			trainer_id,
			pe_packages!inner(id, name),
			pe_rooms(id, name),
			pe_trainers(id, name)
		)
	`;
}

export const load: PageServerLoad = async ({ locals: { supabase, user, userRole }, url, parent }) => {
	// Ensure admin and coordinator users can access this page
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	// Get all layout data (packages, trainers, rooms, trainees are inherited from parent layout)
	const { packages: allPackages } = await parent();
	const packages = allPackages.filter(pkg => pkg.is_active !== false).sort((a, b) => a.name.localeCompare(b.name));

	// Check if we have query parameters for dynamic appointment loading
	const packageId = url.searchParams.get('package_id');
	const startDate = url.searchParams.get('start_date');
	const weeksDuration = url.searchParams.get('weeks_duration');
	const selectedPurchaseId = url.searchParams.get('selected_purchase_id');

	let appointments: AppointmentWithRelations[] = [];
	let existingPurchaseSeries: ExistingPurchaseSeries[] = [];
	let existingPurchaseTrainees: number[] = [];

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

		// Also fetch existing appointment series for this package (for purchase selection)
		const { data: seriesData, error: seriesError } = await supabase
			.from('pe_appointments')
			.select(getAppointmentSeriesQuery())
			.eq('pe_purchases.pe_packages.id', packageId)
			.eq('status', 'scheduled')
			.gte('appointment_date', new Date().toISOString().split('T')[0]) // Only future appointments
			.order('appointment_date');

		if (seriesError) {
			throw error(500, 'Mevcut randevu serileri yüklenirken hata: ' + seriesError.message);
		}

		// Process appointment series for this specific package
		existingPurchaseSeries = processAppointmentSeries(seriesData, packageId);
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

		// Always fetch existing appointment series for group packages (for purchase selection)
		// Get all group packages to fetch their existing series
		const groupPackages = packages?.filter((pkg) => pkg.package_type === 'group') || [];

		if (groupPackages.length > 0) {
			const groupPackageIds = groupPackages.map((pkg) => pkg.id);

			const { data: seriesData, error: seriesError } = await supabase
				.from('pe_appointments')
				.select(getAppointmentSeriesQuery())
				.not('purchase_id', 'is', null)
				.eq('status', 'scheduled')
				.gte('appointment_date', new Date().toISOString().split('T')[0]) // Only future appointments
				.order('appointment_date');

			if (seriesError) {
				throw error(500, 'Mevcut randevu serileri yüklenirken hata: ' + seriesError.message);
			}

			// Filter series data to only include group packages and process
			const filteredSeriesData =
				seriesData?.filter((appointment) => {
					const packageId = appointment.pe_purchases?.pe_packages?.id;
					return packageId && groupPackageIds.includes(packageId);
				}) || [];

			existingPurchaseSeries = processAppointmentSeries(filteredSeriesData);
		}
	}

	// If a specific purchase is selected, fetch its existing trainees
	if (selectedPurchaseId) {
		const { data: purchaseTrainees, error: purchaseTraineesError } = await supabase
			.from('pe_purchase_trainees')
			.select('trainee_id')
			.eq('purchase_id', parseInt(selectedPurchaseId))
			.or('end_date.is.null,end_date.gt.' + new Date().toISOString().split('T')[0]); // Only active trainees

		if (purchaseTraineesError) {
			throw error(500, 'Satın alma öğrencileri yüklenirken hata: ' + purchaseTraineesError.message);
		}

		existingPurchaseTrainees = purchaseTrainees?.map((pt) => pt.trainee_id) || [];
	}

	return {
		packages: packages || [],
		appointments,
		existingPurchaseSeries,
		existingPurchaseTrainees
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

		// Check if this is an existing purchase assignment (add trainees to existing purchase)
		const isExistingPurchaseAssignment = assignmentForm.purchase_id && assignmentForm.purchase_id > 0;

		// Validate required fields based on assignment type
		if (!assignmentForm.package_id) {
			return fail(400, {
				success: false,
				message: 'Paket seçimi gereklidir'
			});
		}

		if (!isExistingPurchaseAssignment) {
			// For new purchases, validate all fields
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

		// Validate lessons per week (only for new purchases)
		if (
			!isExistingPurchaseAssignment &&
			assignmentForm.time_slots.length !== packageData.lessons_per_week
		) {
			return fail(400, {
				success: false,
				message: `Bu paket için ${packageData.lessons_per_week} zaman dilimi seçmelisiniz`
			});
		}

		try {
			// SCENARIO 1: Add trainees to existing purchase
			if (isExistingPurchaseAssignment && assignmentForm.purchase_id) {
				// Add trainees to the existing purchase
				const purchaseTraineeInserts = assignmentForm.trainee_ids.map((traineeId) => ({
					purchase_id: assignmentForm.purchase_id!,
					trainee_id: traineeId,
					start_date: new Date().toISOString().split('T')[0]
				}));

				const { error: purchaseTraineeError } = await supabase
					.from('pe_purchase_trainees')
					.insert(purchaseTraineeInserts);

				if (purchaseTraineeError) {
					return fail(500, {
						success: false,
						message: 'Öğrenciler satın almaya eklenirken hata: ' + purchaseTraineeError.message
					});
				}

				return {
					success: true,
					message: `${assignmentForm.trainee_ids.length} öğrenci mevcut programa başarıyla eklendi`
				};
			}

			// SCENARIO 2: Create new purchase with appointments

			// Check availability before creating any appointments
			// For private packages: use actual weeks_duration, for group packages: use batch size
			const weeksToCheck =
				packageData.package_type === 'private' && packageData.weeks_duration
					? packageData.weeks_duration
					: 26; // For group packages, check initial batch of 26 weeks

			const startDate = new Date(assignmentForm.start_date);

			for (const slot of assignmentForm.time_slots) {
				for (let week = 0; week < weeksToCheck; week++) {
					// Calculate appointment date based on start date and week offset
					const appointmentDate = new Date(startDate);
					appointmentDate.setDate(startDate.getDate() + week * 7);

					// Check if this specific time slot is available for the room and trainer
					const { data: conflictingAppointment } = await supabase
						.from('pe_appointments')
						.select('id, pe_purchases!inner(room_id, trainer_id)')
						.eq('pe_purchases.room_id', assignmentForm.room_id)
						.eq('pe_purchases.trainer_id', assignmentForm.trainer_id)
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

			// Create a new purchase directly (no group complexity)
			// Get package reschedule details
			const rescheduleLeft = packageData.reschedulable
				? (packageData.reschedule_limit ?? 999) // null means unlimited, so set to high number
				: 0;

			// Calculate dates for the new purchase
			const endDate =
				packageData.package_type === 'private' && packageData.weeks_duration
					? (() => {
							const end = new Date(startDate);
							end.setDate(startDate.getDate() + packageData.weeks_duration * 7 - 1); // Sunday of the last week
							return end;
						})()
					: null; // null for group packages (unlimited)

			// Create time slot pattern from assignment form
			const timeSlotPattern: TimeSlotPattern[] = assignmentForm.time_slots.map((slot) => ({
				day: slot.day as DayOfWeek,
				hour: slot.hour
			}));

			// Calculate how many weeks to create initially
			const weeksToCreate =
				packageData.package_type === 'private' && packageData.weeks_duration
					? packageData.weeks_duration // Private packages: create all weeks
					: 26; // Group packages: create initial batch of 26 weeks

			const appointmentsCreatedUntil = new Date(
				startDate.getTime() + weeksToCreate * 7 * 24 * 60 * 60 * 1000
			);

			// Create the purchase
			const { data: purchaseData, error: purchaseError } = await supabase
				.from('pe_purchases')
				.insert({
					package_id: assignmentForm.package_id,
					reschedule_left: rescheduleLeft,
					start_date: startDate.toISOString().split('T')[0],
					end_date: endDate ? endDate.toISOString().split('T')[0] : null,
					appointments_created_until: appointmentsCreatedUntil.toISOString().split('T')[0],
					time_slots: timeSlotPattern,
					room_id: assignmentForm.room_id,
					trainer_id: assignmentForm.trainer_id
				})
				.select('id')
				.single();

			if (purchaseError) {
				return fail(500, {
					success: false,
					message: 'Satın alma oluşturulurken hata: ' + purchaseError.message
				});
			}

			const purchaseId = purchaseData.id;

			// Add trainees to the purchase if any selected
			if (assignmentForm.trainee_ids.length > 0) {
				const purchaseTraineeInserts = assignmentForm.trainee_ids.map((traineeId) => ({
					purchase_id: purchaseId,
					trainee_id: traineeId,
					start_date: startDate.toISOString().split('T')[0]
				}));

				const { error: purchaseTraineeError } = await supabase
					.from('pe_purchase_trainees')
					.insert(purchaseTraineeInserts);

				if (purchaseTraineeError) {
					return fail(500, {
						success: false,
						message: 'Öğrenciler satın almaya eklenirken hata: ' + purchaseTraineeError.message
					});
				}
			}

			// Create appointments for the purchase
			// Generate series_id for grouping all appointments of this purchase
			const seriesId = randomUUID();

			// Calculate total sessions based on package type and lessons per week
			const totalSessions =
				packageData.package_type === 'private' && packageData.weeks_duration
					? packageData.weeks_duration * assignmentForm.time_slots.length
					: null; // null for unlimited group packages

			const allAppointments = [];
			let sessionCounter = 1;

			// Create appointments week by week, then slot by slot within each week
			for (let week = 0; week < weeksToCreate; week++) {
				for (const slot of assignmentForm.time_slots) {
					// Calculate the actual appointment date for this slot's day of the week
					const weekStart = new Date(startDate);
					weekStart.setDate(startDate.getDate() + week * 7); // Add week offset

					// Get the actual date for this day of the week within the target week
					const appointmentDate = getDateForDayOfWeek(weekStart, slot.day);

					allAppointments.push({
						purchase_id: purchaseId,
						hour: slot.hour,
						appointment_date: appointmentDate.toISOString().split('T')[0],
						series_id: seriesId,
						session_number: sessionCounter,
						total_sessions: totalSessions,
						status: 'scheduled'
					});

					sessionCounter++;
				}
			}

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

			return {
				success: true,
				message: `${allAppointments.length} randevu başarıyla oluşturuldu`
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
