import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type {
	AppointmentWithDetails,
	AppointmentSummaryResult,
	TraineeApptResult,
	TraineeApptSummaryResult,
	RecordWithAppt
} from '$lib/types/Transfer';
import { getRequiredFormDataString } from '$lib/utils/form-utils';
import {
	addWeeksToDate,
	getDayOfWeekFromDate,
	formatShortTurkishDateTime
} from '$lib/utils/date-utils';
import type { DayOfWeek, ShiftedAppointment } from '$lib/types/Schedule';
import type { ShiftNotificationEntry } from '$lib/types/WhatsApp';
import {
	getGroupLessonCanonicalSlots,
	getPurchaseSuccessorChain
} from '$lib/utils/extension-utils';
import {
	buildTraineeEligibleByGroup,
	renumberTraineeSessionsInChain,
	shiftSeriesBySlot,
	shiftTraineeRecordsBySlot
} from '$lib/utils/shift-utils';
import { getWhatsAppRepository } from '$lib/whatsapp';

const APPOINTMENT_SELECT_QUERY = `
	*,
	pe_rooms(id, name),
	pe_trainers(id, name),
	pe_purchases(id, pe_packages(name, package_type)),
	pe_group_lessons(id, pe_packages(name, package_type, max_capacity)),
	pe_appointment_trainees(
		id,
		session_number,
		total_sessions,
		pe_trainees(id, name, phone)
	)
`;

const APPOINTMENT_SUMMARY_SELECT_QUERY = `
	id,
	date,
	hour,
	group_lesson_id,
	pe_rooms(id, name),
	pe_trainers(id, name)
`;

async function getReferenceDateTime(
	supabase: SupabaseClient<Database>,
	appointmentId: number
): Promise<{ date: string; hour: number } | null> {
	const { data } = await supabase
		.from('pe_appointments')
		.select('date, hour')
		.eq('id', appointmentId)
		.single();

	if (!data || !data.date || data.hour === null) {
		return null;
	}

	return { date: data.date, hour: data.hour };
}

async function getFutureAppointmentsByPurchase(
	supabase: SupabaseClient<Database>,
	appointmentId: number,
	purchaseId: string
): Promise<AppointmentWithDetails[]> {
	const refDateTime = await getReferenceDateTime(supabase, appointmentId);
	if (!refDateTime) return [];

	const { data: appointments } = await supabase
		.from('pe_appointments')
		.select(APPOINTMENT_SELECT_QUERY)
		.eq('purchase_id', purchaseId)
		.or(`date.gt.${refDateTime.date},and(date.eq.${refDateTime.date},hour.gte.${refDateTime.hour})`)
		.order('date', { ascending: true })
		.order('hour', { ascending: true });

	let allAppointments = (appointments || []) as AppointmentWithDetails[];

	const successorChain = await getPurchaseSuccessorChain(supabase, purchaseId);
	for (const successorId of successorChain.slice(1)) {
		const { data: successorAppts } = await supabase
			.from('pe_appointments')
			.select(APPOINTMENT_SELECT_QUERY)
			.eq('purchase_id', successorId)
			.order('date', { ascending: true })
			.order('hour', { ascending: true });

		if (successorAppts) {
			allAppointments = [...allAppointments, ...(successorAppts as AppointmentWithDetails[])];
		}
	}

	return allAppointments;
}

async function getFutureAppointmentsByGroupLesson(
	supabase: SupabaseClient<Database>,
	appointmentId: number,
	groupLessonId: string
): Promise<AppointmentWithDetails[]> {
	const refDateTime = await getReferenceDateTime(supabase, appointmentId);
	if (!refDateTime) return [];

	const { data: appointments } = await supabase
		.from('pe_appointments')
		.select(APPOINTMENT_SELECT_QUERY)
		.eq('group_lesson_id', groupLessonId)
		.or(`date.gt.${refDateTime.date},and(date.eq.${refDateTime.date},hour.gte.${refDateTime.hour})`)
		.order('date', { ascending: true })
		.order('hour', { ascending: true });

	return (appointments || []) as AppointmentWithDetails[];
}

// Keeps only appointments whose (day-of-week, hour) is in the canonical slot set,
// dropping one-off reschedule destinations that landed on off-pattern days/hours.
function filterToCanonicalSlots<T extends { date: string | null; hour: number | null }>(
	appointments: T[],
	canonicalSlots: Set<string>
): T[] {
	if (canonicalSlots.size === 0) return appointments;
	return appointments.filter((apt) => {
		if (!apt.date || apt.hour === null) return false;
		const day = getDayOfWeekFromDate(apt.date);
		return canonicalSlots.has(`${day}-${apt.hour}`);
	});
}

// Per-group variant: each appointment is filtered against ITS OWN group lesson's canonical
// slot set. Used when a single list spans multiple group lessons (e.g. a trainee shift where
// the trainee attends several group lessons under one purchase chain).
async function filterByGroupCanonicalSlots<
	T extends { date: string | null; hour: number | null; group_lesson_id: string | null }
>(
	supabase: SupabaseClient<Database>,
	appointments: T[],
	cache: Map<string, Set<string>>
): Promise<T[]> {
	const groupIds = new Set<string>();
	for (const apt of appointments) {
		if (apt.group_lesson_id && !cache.has(apt.group_lesson_id)) {
			groupIds.add(apt.group_lesson_id);
		}
	}
	for (const id of groupIds) {
		const { slotKeys } = await getGroupLessonCanonicalSlots(supabase, id);
		cache.set(id, slotKeys);
	}
	return appointments.filter((apt) => {
		if (!apt.date || apt.hour === null) return false;
		if (!apt.group_lesson_id) return true;
		const slots = cache.get(apt.group_lesson_id);
		if (!slots || slots.size === 0) return true;
		const day = getDayOfWeekFromDate(apt.date);
		return slots.has(`${day}-${apt.hour}`);
	});
}

async function hasConflict(
	supabase: SupabaseClient<Database>,
	appointment: AppointmentWithDetails,
	roomId: string | null,
	trainerId: string | null
): Promise<{ roomConflict: boolean; trainerConflict: boolean }> {
	if (!appointment.date || appointment.hour === null) {
		return { roomConflict: false, trainerConflict: false };
	}

	let roomConflict = false;
	let trainerConflict = false;

	if (roomId) {
		const { data } = await supabase
			.from('pe_appointments')
			.select('id')
			.eq('room_id', roomId)
			.eq('date', appointment.date)
			.eq('hour', appointment.hour)
			.neq('id', appointment.id);
		roomConflict = !!(data && data.length > 0);
	}

	if (trainerId) {
		const { data } = await supabase
			.from('pe_appointments')
			.select('id')
			.eq('trainer_id', trainerId)
			.eq('date', appointment.date)
			.eq('hour', appointment.hour)
			.neq('id', appointment.id);
		trainerConflict = !!(data && data.length > 0);
	}

	return { roomConflict, trainerConflict };
}

async function sendShiftNotifications(
	appointments: AppointmentWithDetails[],
	getNewSlot: (apt: AppointmentWithDetails) => { date: string; hour: number },
	cause: string
): Promise<number> {
	const entries: ShiftNotificationEntry[] = appointments.flatMap((apt) => {
		if (!apt.date || apt.hour === null) return [];
		const packageName =
			apt.pe_purchases?.pe_packages?.name ?? apt.pe_group_lessons?.pe_packages?.name ?? '';
		const oldDateTime = formatShortTurkishDateTime(apt.date, apt.hour);
		const next = getNewSlot(apt);
		const newDateTime = formatShortTurkishDateTime(next.date, next.hour);

		return apt.pe_appointment_trainees
			.filter((at) => at.pe_trainees?.phone)
			.map((at) => ({
				phone: at.pe_trainees!.phone,
				oldDateTime,
				newDateTime,
				packageName
			}));
	});

	return getWhatsAppRepository().sendShiftNotifications(entries, cause);
}

// Mirrors the series-selection that shiftSeriesBySlot does internally, but with full
// appointment details (rooms/trainers/packages/trainees) so we can build WhatsApp
// notifications that reference the package name and the trainees on each appointment.
async function loadAppointmentDetailsForSeries(
	supabase: SupabaseClient<Database>,
	fromAppointmentId: number
): Promise<Map<number, AppointmentWithDetails>> {
	const { data: appt } = await supabase
		.from('pe_appointments')
		.select('purchase_id, group_lesson_id')
		.eq('id', fromAppointmentId)
		.single();

	if (!appt) return new Map();

	let series: AppointmentWithDetails[] = [];
	if (appt.purchase_id) {
		series = await getFutureAppointmentsByPurchase(supabase, fromAppointmentId, appt.purchase_id);
	} else if (appt.group_lesson_id) {
		series = await getFutureAppointmentsByGroupLesson(
			supabase,
			fromAppointmentId,
			appt.group_lesson_id
		);
		const { slotKeys } = await getGroupLessonCanonicalSlots(supabase, appt.group_lesson_id);
		series = filterToCanonicalSlots(series, slotKeys);
	}

	return new Map(series.map((a) => [a.id, a]));
}

async function sendSlotShiftNotifications(
	shifted: ShiftedAppointment[],
	detailsByAppt: Map<number, AppointmentWithDetails>,
	cause: string
): Promise<number> {
	const ordered = shifted
		.map((s) => ({ shift: s, apt: detailsByAppt.get(s.id) }))
		.filter(
			(entry): entry is { shift: ShiftedAppointment; apt: AppointmentWithDetails } => !!entry.apt
		);

	return sendShiftNotifications(
		ordered.map((entry) => entry.apt),
		(apt) => {
			const match = ordered.find((entry) => entry.apt.id === apt.id);
			return match
				? { date: match.shift.newDate, hour: match.shift.newHour }
				: { date: apt.date!, hour: apt.hour! };
		},
		cause
	);
}

export const load: PageServerLoad = async ({
	url,
	locals: { supabase, user, userRole },
	parent
}) => {
	// Verify permissions
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	const appointmentIdParam = url.searchParams.get('appointment_id');
	if (!appointmentIdParam) {
		throw error(400, 'Randevu ID gerekli');
	}

	const appointmentId = Number(appointmentIdParam);
	if (isNaN(appointmentId)) {
		throw error(400, 'Geçersiz randevu ID');
	}

	// Check if this is a trainee shift mode
	const traineeIdParam = url.searchParams.get('trainee_id');
	const traineeId = traineeIdParam || null;

	// Load appointment with all relations
	const { data: appointment, error: appointmentError } = await supabase
		.from('pe_appointments')
		.select(
			`
			*,
			pe_rooms(id, name),
			pe_trainers(id, name),
			pe_purchases(id, pe_packages(name, package_type)),
			pe_group_lessons(id, pe_packages(name, package_type)),
			pe_appointment_trainees(
				id,
				session_number,
				total_sessions,
				pe_trainees(id, name)
			)
		`
		)
		.eq('id', appointmentId)
		.single();

	if (appointmentError || !appointment) {
		throw error(404, 'Randevu bulunamadı');
	}

	// Check if appointment is in the past
	if (appointment.date && appointment.hour !== null) {
		const appointmentDateTime = new Date(appointment.date);
		appointmentDateTime.setHours(appointment.hour, 0, 0, 0);
		const now = new Date();

		if (appointmentDateTime < now) {
			throw error(400, 'Geçmiş randevular değiştirilemez');
		}
	}

	// Get rooms and trainers from parent layout
	const { rooms, trainers } = await parent();

	// Get future appointments for both private and group (from selected onwards)
	let futureAppointments: AppointmentWithDetails[] = [];

	if (appointment.purchase_id) {
		futureAppointments = await getFutureAppointmentsByPurchase(
			supabase,
			appointmentId,
			appointment.purchase_id
		);
	} else if (appointment.group_lesson_id) {
		// If trainee shift mode, get only appointments where this trainee is enrolled
		if (traineeId) {
			const refDateTime = await getReferenceDateTime(supabase, appointmentId);
			if (!refDateTime) {
				throw error(400, 'Randevu bilgisi alınamadı');
			}

			// Get trainee's purchase_id first
			const { data: traineeRecord } = await supabase
				.from('pe_appointment_trainees')
				.select('purchase_id')
				.eq('appointment_id', appointmentId)
				.eq('trainee_id', traineeId)
				.single();

			if (!traineeRecord?.purchase_id) {
				throw error(404, 'Öğrenci kaydı bulunamadı');
			}

			// Get all purchases in the chain (current + all successors)
			const purchaseChain = await getPurchaseSuccessorChain(supabase, traineeRecord.purchase_id);

			// Get appointments where trainee is enrolled (from selected onwards, including extensions)
			const { data: traineeAppts } = await supabase
				.from('pe_appointment_trainees')
				.select(
					`
					appointment_id,
					pe_appointments(
						${APPOINTMENT_SELECT_QUERY}
					)
				`
				)
				.eq('trainee_id', traineeId)
				.in('purchase_id', purchaseChain);

			if (traineeAppts) {
				futureAppointments = (traineeAppts as TraineeApptResult[])
					.map((t) => t.pe_appointments)
					.filter((a): a is AppointmentWithDetails => {
						if (!a || !a.date || a.hour === null) return false;
						return (
							a.date > refDateTime.date ||
							(a.date === refDateTime.date && a.hour >= refDateTime.hour)
						);
					})
					.sort((a, b) => {
						const dateCompare = (a.date ?? '').localeCompare(b.date ?? '');
						if (dateCompare !== 0) return dateCompare;
						return (a.hour ?? 0) - (b.hour ?? 0);
					});
			}
		} else {
			// Regular group lesson - get all appointments
			futureAppointments = await getFutureAppointmentsByGroupLesson(
				supabase,
				appointmentId,
				appointment.group_lesson_id
			);
		}
	}

	// Get all appointments from today onwards
	const today = new Date().toISOString().split('T')[0];
	let allFromNowAppointments: AppointmentSummaryResult[] = [];

	if (appointment.purchase_id) {
		const purchaseChain = await getPurchaseSuccessorChain(supabase, appointment.purchase_id);
		const { data: chainAppts } = await supabase
			.from('pe_appointments')
			.select(APPOINTMENT_SUMMARY_SELECT_QUERY)
			.in('purchase_id', purchaseChain)
			.gte('date', today)
			.order('date', { ascending: true })
			.order('hour', { ascending: true });
		allFromNowAppointments = (chainAppts || []) as AppointmentSummaryResult[];
	} else if (appointment.group_lesson_id) {
		// If trainee shift mode, get only trainee's enrolled appointments (including extensions)
		if (traineeId) {
			const { data: traineeRecord } = await supabase
				.from('pe_appointment_trainees')
				.select('purchase_id')
				.eq('appointment_id', appointmentId)
				.eq('trainee_id', traineeId)
				.single();

			if (traineeRecord?.purchase_id) {
				// Get all purchases in the chain (current + all successors)
				const purchaseChain = await getPurchaseSuccessorChain(supabase, traineeRecord.purchase_id);

				const { data: traineeAppts } = await supabase
					.from('pe_appointment_trainees')
					.select(
						`
						appointment_id,
						pe_appointments(${APPOINTMENT_SUMMARY_SELECT_QUERY})
					`
					)
					.eq('trainee_id', traineeId)
					.in('purchase_id', purchaseChain);

				if (traineeAppts) {
					allFromNowAppointments = (traineeAppts as TraineeApptSummaryResult[])
						.map((t) => t.pe_appointments)
						.filter((a): a is AppointmentSummaryResult => a !== null && !!a.date && a.date >= today)
						.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
				}
			}
		} else {
			// Regular group lesson - get all appointments
			const { data: groupAppts } = await supabase
				.from('pe_appointments')
				.select(APPOINTMENT_SUMMARY_SELECT_QUERY)
				.eq('group_lesson_id', appointment.group_lesson_id)
				.gte('date', today)
				.order('date', { ascending: true })
				.order('hour', { ascending: true });
			allFromNowAppointments = (groupAppts || []) as AppointmentSummaryResult[];
		}
	}

	// For group lessons, drop one-off reschedule destinations from both lists so the affected-
	// appointments view and slot-shift preview only consider the canonical recurring schedule.
	// Trainee shift can span multiple group lessons via the purchase chain, so each appointment
	// is filtered against its own group's canonical slots — using only the clicked group's
	// slots would wrongly drop the trainee's records from other group lessons.
	let canonicalTimeslots: Array<{ day: DayOfWeek; hour: number }> = [];
	if (appointment.group_lesson_id) {
		if (traineeId) {
			const canonicalCache = new Map<string, Set<string>>();
			futureAppointments = await filterByGroupCanonicalSlots(
				supabase,
				futureAppointments,
				canonicalCache
			);
			allFromNowAppointments = await filterByGroupCanonicalSlots(
				supabase,
				allFromNowAppointments,
				canonicalCache
			);
			const canonical = await getGroupLessonCanonicalSlots(supabase, appointment.group_lesson_id);
			canonicalTimeslots = canonical.slots;
		} else {
			const canonical = await getGroupLessonCanonicalSlots(supabase, appointment.group_lesson_id);
			futureAppointments = filterToCanonicalSlots(futureAppointments, canonical.slotKeys);
			allFromNowAppointments = filterToCanonicalSlots(allFromNowAppointments, canonical.slotKeys);
			canonicalTimeslots = canonical.slots;
		}
	}

	// For trainee slot-shift previews, the UI needs the trainee's own per-group eligible
	// list (not the group's full canonical pattern). A trainee in a Mon-Sun-13 group who
	// only attends Wed shifts Wed→next-Wed, not Wed→Thu — and the same goes for any cross-
	// group records under their purchase chain.
	let slotShiftEligibleByGroup: Record<
		string,
		Array<{ id: number; date: string; hour: number }>
	> = {};
	if (traineeId && appointment.date) {
		const recordsForPattern = allFromNowAppointments
			.filter(
				(a): a is typeof a & { date: string; hour: number; group_lesson_id: string } =>
					!!a.date && a.hour !== null && !!a.group_lesson_id
			)
			.map((a) => ({ groupLessonId: a.group_lesson_id, date: a.date, hour: a.hour }));
		const eligibleMap = await buildTraineeEligibleByGroup(
			supabase,
			recordsForPattern,
			appointment.date
		);
		slotShiftEligibleByGroup = Object.fromEntries(eligibleMap);
	}

	// If trainee shift mode, fetch trainee and purchase info
	let traineeInfo: { id: string; name: string; purchase_id: string } | null = null;
	if (traineeId && appointment.group_lesson_id) {
		const { data: traineeData } = await supabase
			.from('pe_appointment_trainees')
			.select('trainee_id, purchase_id, pe_trainees(id, name)')
			.eq('appointment_id', appointmentId)
			.eq('trainee_id', traineeId)
			.single();

		if (traineeData && traineeData.pe_trainees) {
			traineeInfo = {
				id: traineeData.trainee_id,
				name: traineeData.pe_trainees.name,
				purchase_id: traineeData.purchase_id
			};
		}
	}

	return {
		appointment: appointment as AppointmentWithDetails,
		rooms: rooms.filter((r) => r.is_active),
		trainers: trainers.filter((t) => t.is_active),
		traineeInfo,
		futureAppointments: futureAppointments.map((a) => ({
			id: a.id,
			date: a.date,
			hour: a.hour,
			group_lesson_id: a.group_lesson_id,
			room_name: a.pe_rooms?.name || null,
			trainer_name: a.pe_trainers?.name || null
		})),
		futureAppointmentCount: futureAppointments.length,
		allFromNowAppointments: allFromNowAppointments.map((a) => ({
			id: a.id,
			date: a.date,
			hour: a.hour,
			group_lesson_id: a.group_lesson_id,
			room_name: a.pe_rooms?.name || null,
			trainer_name: a.pe_trainers?.name || null
		})),
		allFromNowCount: allFromNowAppointments.length,
		canonicalTimeslots,
		slotShiftEligibleByGroup
	};
};

export const actions: Actions = {
	transfer: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { success: false, message: 'Unauthorized' });
		}

		const formData = await request.formData();
		const appointmentId = Number(getRequiredFormDataString(formData, 'appointment_id'));
		const scope = getRequiredFormDataString(formData, 'scope');
		const newRoomId = formData.get('new_room_id')?.toString() || null;
		const newTrainerId = formData.get('new_trainer_id')?.toString() || null;
		const changeRoom = formData.get('change_room') === 'true';
		const changeTrainer = formData.get('change_trainer') === 'true';

		// Validation
		if (!changeRoom && !changeTrainer) {
			return fail(400, {
				success: false,
				message: 'En az oda veya eğitmen seçilmeli'
			});
		}

		// Get the appointment
		const { data: appointment } = await supabase
			.from('pe_appointments')
			.select('purchase_id, group_lesson_id, room_id, trainer_id')
			.eq('id', appointmentId)
			.single();

		if (!appointment) {
			return fail(404, { success: false, message: 'Randevu bulunamadı' });
		}

		// Get appointments to transfer
		let appointmentsToTransfer: AppointmentWithDetails[] = [];

		if (scope === 'single') {
			const { data: singleAppt } = await supabase
				.from('pe_appointments')
				.select(APPOINTMENT_SELECT_QUERY)
				.eq('id', appointmentId)
				.single();

			if (singleAppt) {
				appointmentsToTransfer = [singleAppt as AppointmentWithDetails];
			}
		} else if (scope === 'from_selected') {
			if (appointment.purchase_id) {
				appointmentsToTransfer = await getFutureAppointmentsByPurchase(
					supabase,
					appointmentId,
					appointment.purchase_id
				);
			} else if (appointment.group_lesson_id) {
				appointmentsToTransfer = await getFutureAppointmentsByGroupLesson(
					supabase,
					appointmentId,
					appointment.group_lesson_id
				);
			}
		} else if (scope === 'all_from_now') {
			const today = new Date().toISOString().split('T')[0];

			if (appointment.purchase_id) {
				const purchaseChain = await getPurchaseSuccessorChain(supabase, appointment.purchase_id);
				const { data: chainAppts } = await supabase
					.from('pe_appointments')
					.select(APPOINTMENT_SELECT_QUERY)
					.in('purchase_id', purchaseChain)
					.gte('date', today);

				if (chainAppts) {
					appointmentsToTransfer = chainAppts as AppointmentWithDetails[];
				}
			} else if (appointment.group_lesson_id) {
				const { data: groupAppts } = await supabase
					.from('pe_appointments')
					.select(APPOINTMENT_SELECT_QUERY)
					.eq('group_lesson_id', appointment.group_lesson_id)
					.gte('date', today);

				if (groupAppts) {
					appointmentsToTransfer = groupAppts as AppointmentWithDetails[];
				}
			}
		}

		// For group lessons, exclude one-off reschedule destinations from the bulk transfer.
		if (appointment.group_lesson_id && scope !== 'single') {
			const { slotKeys } = await getGroupLessonCanonicalSlots(
				supabase,
				appointment.group_lesson_id
			);
			appointmentsToTransfer = filterToCanonicalSlots(appointmentsToTransfer, slotKeys);
		}

		// Final conflict check
		const conflicts = [];
		for (const apt of appointmentsToTransfer) {
			const { roomConflict, trainerConflict } = await hasConflict(
				supabase,
				apt,
				changeRoom ? newRoomId : null,
				changeTrainer ? newTrainerId : null
			);

			if (roomConflict || trainerConflict) {
				conflicts.push({ date: apt.date, hour: apt.hour, roomConflict, trainerConflict });
			}
		}

		if (conflicts.length > 0) {
			return fail(400, {
				success: false,
				message: `${conflicts.length} çakışma tespit edildi. Lütfen önce çakışmaları kontrol edin.`,
				conflicts
			});
		}

		// Build update data
		const updateData: { room_id?: string; trainer_id?: string } = {};
		if (changeRoom && newRoomId) updateData.room_id = newRoomId;
		if (changeTrainer && newTrainerId) updateData.trainer_id = newTrainerId;

		// Perform the transfer
		const appointmentIds = appointmentsToTransfer.map((a) => a.id);
		const { error: updateError } = await supabase
			.from('pe_appointments')
			.update(updateData)
			.in('id', appointmentIds);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Aktarma sırasında hata oluştu: ' + updateError.message
			});
		}

		// Redirect to schedule
		throw redirect(303, '/schedule');
	},

	shift_by_time: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { success: false, message: 'Unauthorized' });
		}

		const formData = await request.formData();
		const appointmentId = Number(getRequiredFormDataString(formData, 'appointment_id'));
		const scope = getRequiredFormDataString(formData, 'scope');
		const weeks = Number(getRequiredFormDataString(formData, 'weeks'));
		const cause = formData.get('cause')?.toString() || '';

		// Validation
		if (weeks === 0) {
			return fail(400, {
				success: false,
				message: 'Kaydırma süresi sıfırdan farklı olmalı'
			});
		}

		if (weeks < -52 || weeks > 52) {
			return fail(400, {
				success: false,
				message: 'Kaydırma süresi -52 ile 52 hafta arasında olmalı'
			});
		}

		// Get the appointment
		const { data: appointment } = await supabase
			.from('pe_appointments')
			.select('purchase_id, group_lesson_id, room_id, trainer_id')
			.eq('id', appointmentId)
			.single();

		if (!appointment) {
			return fail(404, { success: false, message: 'Randevu bulunamadı' });
		}

		// Get appointments to shift
		let appointmentsToShift: AppointmentWithDetails[] = [];

		if (scope === 'single') {
			const { data: singleAppt } = await supabase
				.from('pe_appointments')
				.select(APPOINTMENT_SELECT_QUERY)
				.eq('id', appointmentId)
				.single();

			if (singleAppt) {
				appointmentsToShift = [singleAppt as AppointmentWithDetails];
			}
		} else if (scope === 'from_selected') {
			if (appointment.purchase_id) {
				appointmentsToShift = await getFutureAppointmentsByPurchase(
					supabase,
					appointmentId,
					appointment.purchase_id
				);
			} else if (appointment.group_lesson_id) {
				appointmentsToShift = await getFutureAppointmentsByGroupLesson(
					supabase,
					appointmentId,
					appointment.group_lesson_id
				);
			}
		} else if (scope === 'all_from_now') {
			const today = new Date().toISOString().split('T')[0];

			if (appointment.purchase_id) {
				const purchaseChain = await getPurchaseSuccessorChain(supabase, appointment.purchase_id);
				const { data: chainAppts } = await supabase
					.from('pe_appointments')
					.select(APPOINTMENT_SELECT_QUERY)
					.in('purchase_id', purchaseChain)
					.gte('date', today);

				if (chainAppts) {
					appointmentsToShift = chainAppts as AppointmentWithDetails[];
				}
			} else if (appointment.group_lesson_id) {
				const { data: groupAppts } = await supabase
					.from('pe_appointments')
					.select(APPOINTMENT_SELECT_QUERY)
					.eq('group_lesson_id', appointment.group_lesson_id)
					.gte('date', today);

				if (groupAppts) {
					appointmentsToShift = groupAppts as AppointmentWithDetails[];
				}
			}
		}

		if (appointment.group_lesson_id && scope !== 'single') {
			const { slotKeys } = await getGroupLessonCanonicalSlots(
				supabase,
				appointment.group_lesson_id
			);
			appointmentsToShift = filterToCanonicalSlots(appointmentsToShift, slotKeys);
		}

		// Final conflict check
		// Get all appointment IDs in the series that will be shifted (to exclude from conflicts)
		const appointmentIdsInSeries = new Set(appointmentsToShift.map((a) => a.id));

		const conflicts = [];
		for (const apt of appointmentsToShift) {
			if (!apt.date || apt.hour === null) continue;

			const newDate = addWeeksToDate(apt.date, weeks);
			let roomConflict = false;
			let trainerConflict = false;

			// Check room conflict
			if (apt.room_id) {
				const { data } = await supabase
					.from('pe_appointments')
					.select('id')
					.eq('room_id', apt.room_id)
					.eq('date', newDate)
					.eq('hour', apt.hour)
					.neq('id', apt.id);

				// Check if any conflicts are NOT in the same series
				if (data && data.length > 0) {
					roomConflict = data.some((conflict) => !appointmentIdsInSeries.has(conflict.id));
				}
			}

			// Check trainer conflict
			if (apt.trainer_id) {
				const { data } = await supabase
					.from('pe_appointments')
					.select('id')
					.eq('trainer_id', apt.trainer_id)
					.eq('date', newDate)
					.eq('hour', apt.hour)
					.neq('id', apt.id);

				// Check if any conflicts are NOT in the same series
				if (data && data.length > 0) {
					trainerConflict = data.some((conflict) => !appointmentIdsInSeries.has(conflict.id));
				}
			}

			if (roomConflict || trainerConflict) {
				conflicts.push({ date: newDate, hour: apt.hour, roomConflict, trainerConflict });
			}
		}

		if (conflicts.length > 0) {
			return fail(400, {
				success: false,
				message: `${conflicts.length} çakışma tespit edildi. Lütfen önce çakışmaları kontrol edin.`,
				conflicts
			});
		}

		// Perform the shift - update each appointment's date
		for (const apt of appointmentsToShift) {
			if (apt.date) {
				const newDate = addWeeksToDate(apt.date, weeks);
				const { error: updateError } = await supabase
					.from('pe_appointments')
					.update({ date: newDate })
					.eq('id', apt.id);

				if (updateError) {
					return fail(500, {
						success: false,
						message: 'Kaydırma sırasında hata oluştu: ' + updateError.message
					});
				}
			}
		}

		// Send WhatsApp notifications
		let notifiedCount = 0;
		if (cause) {
			notifiedCount = await sendShiftNotifications(
				appointmentsToShift,
				(apt) => ({ date: addWeeksToDate(apt.date!, weeks), hour: apt.hour! }),
				cause
			);
		}

		// Redirect to schedule
		throw redirect(303, `/schedule?notified=${notifiedCount}`);
	},

	shift_by_slot: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { success: false, message: 'Unauthorized' });
		}

		const formData = await request.formData();
		const appointmentId = Number(getRequiredFormDataString(formData, 'appointment_id'));
		const scope = getRequiredFormDataString(formData, 'scope');
		const slots = Number(getRequiredFormDataString(formData, 'slots'));
		const cause = formData.get('cause')?.toString() || '';

		if (slots > 20) {
			return fail(400, {
				success: false,
				message: "Kaydırma sayısı 20'den fazla olamaz"
			});
		}

		if (scope !== 'from_selected') {
			return fail(400, {
				success: false,
				message:
					'Tekli kaydırma sadece "Seçilen ve sonraki tüm randevular" kapsamında kullanılabilir'
			});
		}

		// Pre-fetch appointments with details so we can build WhatsApp messages from the
		// pre-shift state. The shared helper re-queries the bare fields it needs internally.
		const detailsByAppt = await loadAppointmentDetailsForSeries(supabase, appointmentId);

		const result = await shiftSeriesBySlot(supabase, appointmentId, slots);

		if (result.conflicts.length > 0) {
			return fail(400, {
				success: false,
				message: `${result.conflicts.length} çakışma tespit edildi. Lütfen önce çakışmaları kontrol edin.`,
				conflicts: result.conflicts
			});
		}

		if (result.error) {
			return fail(500, { success: false, message: result.error });
		}

		let notifiedCount = 0;
		if (cause) {
			notifiedCount = await sendSlotShiftNotifications(result.shifted, detailsByAppt, cause);
		}

		throw redirect(303, `/schedule?notified=${notifiedCount}`);
	},

	shift_trainee_by_time: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, {
				success: false,
				message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
			});
		}

		const formData = await request.formData();
		const appointmentId = Number(getRequiredFormDataString(formData, 'appointment_id'));
		const traineeId = getRequiredFormDataString(formData, 'trainee_id');
		const weeks = Number(getRequiredFormDataString(formData, 'weeks'));

		// Get the trainee's current appointment_trainee record for this appointment
		const { data: currentRecord } = await supabase
			.from('pe_appointment_trainees')
			.select('*, pe_appointments(group_lesson_id, date, hour)')
			.eq('appointment_id', appointmentId)
			.eq('trainee_id', traineeId)
			.single();

		if (!currentRecord || !currentRecord.pe_appointments) {
			return fail(404, { success: false, message: 'Öğrenci kaydı bulunamadı' });
		}

		const groupLessonId = currentRecord.pe_appointments.group_lesson_id;
		if (!groupLessonId) {
			return fail(400, {
				success: false,
				message: 'Bu işlem sadece grup dersleri için geçerlidir'
			});
		}

		// Get all future appointment_trainee records for this trainee and purchase chain (including extensions)
		const refDate = currentRecord.pe_appointments.date;
		const refHour = currentRecord.pe_appointments.hour;

		// Get all purchases in the chain (current + all successors)
		const purchaseChain = await getPurchaseSuccessorChain(supabase, currentRecord.purchase_id);

		const { data: futureRecords } = await supabase
			.from('pe_appointment_trainees')
			.select('id, appointment_id, session_number, pe_appointments(date, hour, group_lesson_id)')
			.eq('trainee_id', traineeId)
			.in('purchase_id', purchaseChain);

		if (!futureRecords || futureRecords.length === 0) {
			return fail(404, { success: false, message: 'Öğrenci randevuları bulunamadı' });
		}

		// Filter to get records from selected appointment onwards
		const recordsToShift = (futureRecords as RecordWithAppt[])
			.filter((r) => {
				if (!r.pe_appointments?.date) return false;
				const aptDate = r.pe_appointments.date;
				const aptHour = r.pe_appointments.hour ?? 0;
				return aptDate > refDate! || (aptDate === refDate && aptHour >= (refHour ?? 0));
			})
			.sort((a, b) => {
				const dateCompare = (a.pe_appointments?.date ?? '').localeCompare(
					b.pe_appointments?.date ?? ''
				);
				if (dateCompare !== 0) return dateCompare;
				return (a.pe_appointments?.hour ?? 0) - (b.pe_appointments?.hour ?? 0);
			});

		// Find target appointments (shifted by N weeks). Each record uses its OWN
		// group_lesson_id — a trainee may attend multiple group lessons under one purchase
		// chain, so we can't pin every lookup to the clicked appointment's group.
		const shiftMap: Array<{ recordId: number; newAppointmentId: number }> = [];

		for (const record of recordsToShift) {
			const currentDate = record.pe_appointments?.date;
			const currentHour = record.pe_appointments?.hour;
			const recordGroupLessonId = record.pe_appointments?.group_lesson_id ?? groupLessonId;
			if (!currentDate || currentHour === null) continue;

			const targetDate = addWeeksToDate(currentDate, weeks);

			// Find appointment at target date/hour
			const { data: targetAppt } = await supabase
				.from('pe_appointments')
				.select('id')
				.eq('group_lesson_id', recordGroupLessonId)
				.eq('date', targetDate)
				.eq('hour', currentHour)
				.single();

			if (!targetAppt) {
				return fail(400, {
					success: false,
					message: `${targetDate} tarihinde ${currentHour}:00 saatinde uygun randevu bulunamadı`
				});
			}

			shiftMap.push({
				recordId: record.id,
				newAppointmentId: targetAppt.id
			});
		}

		// Update all records
		for (const shift of shiftMap) {
			const { error: updateError } = await supabase
				.from('pe_appointment_trainees')
				.update({ appointment_id: shift.newAppointmentId })
				.eq('id', shift.recordId);

			if (updateError) {
				return fail(500, {
					success: false,
					message: 'Öğrenci kaydırma sırasında hata oluştu'
				});
			}
		}

		if (shiftMap.length > 0) {
			const renumber = await renumberTraineeSessionsInChain(supabase, traineeId, purchaseChain);
			if (renumber.error) {
				return fail(500, { success: false, message: renumber.error });
			}
		}

		throw redirect(303, '/schedule');
	},

	shift_trainee_by_slot: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, {
				success: false,
				message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
			});
		}

		const formData = await request.formData();
		const appointmentId = Number(getRequiredFormDataString(formData, 'appointment_id'));
		const traineeId = getRequiredFormDataString(formData, 'trainee_id');
		const slots = Number(getRequiredFormDataString(formData, 'slots'));

		const result = await shiftTraineeRecordsBySlot(supabase, appointmentId, traineeId, slots);
		if (result.error) {
			return fail(400, { success: false, message: result.error });
		}

		throw redirect(303, '/schedule');
	}
};
