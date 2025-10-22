import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { AppointmentWithDetails } from '$lib/types/Transfer';
import { getRequiredFormDataString } from '$lib/utils/form-utils';

const APPOINTMENT_SELECT_QUERY = `
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
`;

const APPOINTMENT_SUMMARY_SELECT_QUERY = `
	id,
	date,
	hour,
	pe_rooms(id, name),
	pe_trainers(id, name)
`;

async function getPurchaseSuccessorChain(
	supabase: SupabaseClient<Database>,
	purchaseId: string
): Promise<string[]> {
	const chain: string[] = [purchaseId];
	let currentId: string | null = purchaseId;

	while (currentId) {
		const { data }: { data: { successor_id: string | null } | null } = await supabase
			.from('pe_purchases')
			.select('successor_id')
			.eq('id', currentId)
			.single();

		if (data?.successor_id) {
			chain.push(data.successor_id);
			currentId = data.successor_id;
		} else {
			break;
		}
	}

	return chain;
}

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
		.or(`date.gt.${refDateTime.date},and(date.eq.${refDateTime.date},hour.gte.${refDateTime.hour})`);

	let allAppointments = (appointments || []) as AppointmentWithDetails[];

	const successorChain = await getPurchaseSuccessorChain(supabase, purchaseId);
	for (const successorId of successorChain.slice(1)) {
		const { data: successorAppts } = await supabase
			.from('pe_appointments')
			.select(APPOINTMENT_SELECT_QUERY)
			.eq('purchase_id', successorId);

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
		.or(`date.gt.${refDateTime.date},and(date.eq.${refDateTime.date},hour.gte.${refDateTime.hour})`);

	return (appointments || []) as AppointmentWithDetails[];
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

export const load: PageServerLoad = async ({ url, locals: { supabase, user, userRole }, parent }) => {
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
		futureAppointments = await getFutureAppointmentsByGroupLesson(
			supabase,
			appointmentId,
			appointment.group_lesson_id
		);
	}

	// Get all appointments from today onwards
	const today = new Date().toISOString().split('T')[0];
	type AppointmentSummaryResult = {
		id: number;
		date: string | null;
		hour: number | null;
		pe_rooms: { id: string; name: string } | null;
		pe_trainers: { id: string; name: string } | null;
	};
	let allFromNowAppointments: AppointmentSummaryResult[] = [];

	if (appointment.purchase_id) {
		const purchaseChain = await getPurchaseSuccessorChain(supabase, appointment.purchase_id);
		const { data: chainAppts } = await supabase
			.from('pe_appointments')
			.select(APPOINTMENT_SUMMARY_SELECT_QUERY)
			.in('purchase_id', purchaseChain)
			.gte('date', today);
		allFromNowAppointments = (chainAppts || []) as AppointmentSummaryResult[];
	} else if (appointment.group_lesson_id) {
		const { data: groupAppts } = await supabase
			.from('pe_appointments')
			.select(APPOINTMENT_SUMMARY_SELECT_QUERY)
			.eq('group_lesson_id', appointment.group_lesson_id)
			.gte('date', today);
		allFromNowAppointments = (groupAppts || []) as AppointmentSummaryResult[];
	}

	return {
		appointment: appointment as AppointmentWithDetails,
		rooms: rooms.filter((r) => r.is_active),
		trainers: trainers.filter((t) => t.is_active),
		futureAppointments: futureAppointments.map(a => ({
			id: a.id,
			date: a.date,
			hour: a.hour,
			room_name: a.pe_rooms?.name || null,
			trainer_name: a.pe_trainers?.name || null
		})),
		futureAppointmentCount: futureAppointments.length,
		allFromNowAppointments: allFromNowAppointments.map(a => ({
			id: a.id,
			date: a.date,
			hour: a.hour,
			room_name: a.pe_rooms?.name || null,
			trainer_name: a.pe_trainers?.name || null
		})),
		allFromNowCount: allFromNowAppointments.length
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
	}
};
