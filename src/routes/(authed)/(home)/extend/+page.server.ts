import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { DayOfWeek } from '$lib/types/Schedule';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type {
	AppointmentRefInfo,
	PurchaseChainDates,
	ExtensionChunk,
	ExtensionResult
} from '$lib/types/Extension';
import {
	findLastPurchaseInChain,
	canExtendPurchase,
	getLastAppointmentDate,
	getCanonicalPurchaseTimeSlots,
	getFutureGroupAppointments
} from '$lib/utils/extension-utils';
import {
	calculateExtensionStartDate,
	getStartingAppointmentCandidates,
	buildAppointmentSlotsFromStart
} from '$lib/utils/slot-utils';
import { PurchaseRepository } from '$lib/server/repositories/purchase-repository';
import { parseLocalDate } from '$lib/utils/date-utils';
import { requireStaff } from '$lib/server/permissions';

// Helper to get appointments for either private or group lessons
async function getAppointmentsForPurchase(
	supabase: SupabaseClient<Database>,
	purchaseId: string,
	limit?: number
): Promise<AppointmentRefInfo[]> {
	// Try direct purchase_id first (for private lessons)
	const { data: directAppointments } = await supabase
		.from('pe_appointments')
		.select('room_id, trainer_id, date, hour')
		.eq('purchase_id', purchaseId)
		.order('date', { ascending: true })
		.limit(limit || 10);

	if (directAppointments && directAppointments.length > 0) {
		return directAppointments.filter(
			(a): a is AppointmentRefInfo =>
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
		const result: AppointmentRefInfo[] = [];
		for (const row of traineeAppointments) {
			const apt = row.pe_appointments;
			if (!apt || Array.isArray(apt)) continue;
			if (apt.room_id && apt.trainer_id && apt.date && apt.hour !== null) {
				result.push({
					room_id: apt.room_id,
					trainer_id: apt.trainer_id,
					date: apt.date,
					hour: apt.hour
				});
			}
		}
		return result;
	}

	return [];
}

// Fetches team trainees with name+id, flattening the join into a clean array.
async function fetchTeamTrainees(
	supabase: SupabaseClient<Database>,
	teamId: string
): Promise<Array<{ id: string; name: string }>> {
	const { data: members } = await supabase.from('pe_teams').select('trainee_id').eq('id', teamId);

	if (!members || members.length === 0) return [];

	const traineeIds = members.map((m) => m.trainee_id).filter((id): id is string => id !== null);
	if (traineeIds.length === 0) return [];

	const { data: trainees } = await supabase
		.from('pe_trainees')
		.select('id, name')
		.in('id', traineeIds);

	return trainees ?? [];
}

// Helper to get appointment dates for purchase chain
async function getAppointmentDatesForPurchase(
	supabase: SupabaseClient<Database>,
	purchaseId: string
): Promise<PurchaseChainDates> {
	const dates: string[] = [];

	// Try direct purchase_id first
	const { data: directRows } = await supabase
		.from('pe_appointments')
		.select('date')
		.eq('purchase_id', purchaseId)
		.order('date', { ascending: true });

	for (const row of directRows ?? []) {
		if (row.date) dates.push(row.date);
	}

	// If no appointments found, try via pe_appointment_trainees
	if (dates.length === 0) {
		const { data: traineeRows } = await supabase
			.from('pe_appointment_trainees')
			.select('pe_appointments(date)')
			.eq('purchase_id', purchaseId)
			.order('pe_appointments(date)', { ascending: true });

		for (const row of traineeRows ?? []) {
			const apt = row.pe_appointments;
			if (!apt || Array.isArray(apt)) continue;
			if (apt.date) dates.push(apt.date);
		}
	}

	if (dates.length === 0) {
		return { start_date: null, end_date: null };
	}

	return {
		start_date: parseLocalDate(dates[0]),
		end_date: parseLocalDate(dates[dates.length - 1])
	};
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
	if (!lastPurchase.package_id || !lastPurchase.team_id) {
		throw error(400, 'Paket veya takım bilgisi eksik');
	}

	// Check if the last purchase can be extended
	const extensionCheck = await canExtendPurchase(supabase, lastPurchase.id);
	if (!extensionCheck.canExtend) {
		throw error(400, extensionCheck.reason || 'Bu paket uzatılamaz');
	}

	// Phase 1: independent fetches in parallel.
	const [chainIds, packageRes, teamRes, refAppointments, lastAppDate] = await Promise.all([
		new PurchaseRepository(supabase).getSuccessorChain(purchaseId),
		supabase.from('pe_packages').select('*').eq('id', lastPurchase.package_id).single(),
		fetchTeamTrainees(supabase, lastPurchase.team_id),
		getAppointmentsForPurchase(supabase, lastPurchase.id, 1),
		getLastAppointmentDate(supabase, lastPurchase.id)
	]);

	if (packageRes.error || !packageRes.data) {
		throw error(404, 'Paket bilgisi bulunamadı');
	}
	const pkg = packageRes.data;
	const isGroup = pkg.package_type === 'group';
	// Private packages have a fixed weeks_duration; group packages set duration per
	// purchase at sign-up, so weeks_duration on the package is allowed to be null.
	if (!isGroup && pkg.weeks_duration === null) {
		throw error(400, 'Paket süresi belirsiz');
	}
	if (refAppointments.length === 0) {
		throw error(404, 'Randevu bilgisi bulunamadı');
	}

	const refRoomId = refAppointments[0].room_id;
	const refTrainerId = refAppointments[0].trainer_id;
	const earliestStart = calculateExtensionStartDate(lastAppDate);
	const weeksDuration = pkg.weeks_duration ?? 0;

	// Phase 2: dependent fetches, also parallelized.
	const [chainDates, roomDataRes, trainerDataRes, slotsResult] = await Promise.all([
		Promise.all(chainIds.map((id) => getAppointmentDatesForPurchase(supabase, id))),
		supabase.from('pe_rooms').select('id, name').eq('id', refRoomId).single(),
		supabase.from('pe_trainers').select('id, name').eq('id', refTrainerId).single(),
		isGroup
			? getFutureGroupAppointments(supabase, lastPurchase.id, earliestStart, weeksDuration)
			: getCanonicalPurchaseTimeSlots(supabase, lastPurchase.id, 'private', weeksDuration)
	]);

	let timeSlots: Array<{ day: DayOfWeek; hour: number }>;
	let startCandidates: Array<{ date: string; hour: number; day: DayOfWeek }>;

	if ('canonicalSlots' in slotsResult) {
		timeSlots = slotsResult.canonicalSlots;
		startCandidates = slotsResult.upcomingAppointments
			.slice(0, 12)
			.map((a) => ({ date: a.date, hour: a.hour, day: a.day }));
	} else {
		timeSlots = slotsResult.slots;
		startCandidates = getStartingAppointmentCandidates(timeSlots, earliestStart, 12);
	}

	if (timeSlots.length === 0) {
		throw error(404, 'Bu paket için ders saatleri belirlenemedi');
	}

	const purchaseChain = chainIds.map((id, i) => ({ id, ...chainDates[i] }));

	const purchaseInfo = {
		id: lastPurchase.id,
		package_id: lastPurchase.package_id,
		package_name: pkg.name,
		package_type: pkg.package_type,
		weeks_duration: weeksDuration,
		min_lessons_per_week: pkg.min_lessons_per_week,
		max_lessons_per_week: pkg.max_lessons_per_week,
		lessons_per_week: timeSlots.length,
		max_capacity: pkg.max_capacity,
		trainees: teamRes,
		room_id: refRoomId,
		room_name: roomDataRes.data?.name || '',
		trainer_id: refTrainerId,
		trainer_name: trainerDataRes.data?.name || '',
		time_slots: timeSlots,
		successor_id: lastPurchase.successor_id
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
		startCandidates,
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
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const purchaseId = formData.get('purchase_id') as string;
		const packageCount = parseInt(formData.get('package_count') as string);
		const startDateStr = formData.get('start_date') as string;
		const startHour = parseInt(formData.get('start_hour') as string);

		if (!purchaseId || !packageCount || packageCount < 1) {
			return fail(400, {
				success: false,
				message: 'Geçersiz form verileri'
			});
		}

		if (!startDateStr || isNaN(startHour)) {
			return fail(400, {
				success: false,
				message: 'Başlangıç randevusu seçilmedi'
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
		if (!lastPurchase.package_id || !lastPurchase.team_id) {
			return fail(400, {
				success: false,
				message: 'Paket veya takım bilgisi eksik'
			});
		}

		const packageRes = await supabase
			.from('pe_packages')
			.select('*')
			.eq('id', lastPurchase.package_id)
			.single();

		if (packageRes.error || !packageRes.data) {
			return fail(404, {
				success: false,
				message: 'Paket bilgisi bulunamadı'
			});
		}
		const packageInfo = packageRes.data;
		if (packageInfo.weeks_duration === null) {
			return fail(400, {
				success: false,
				message: 'Paket süresi belirsiz'
			});
		}

		const [{ data: refAppointment }, { slots: timeSlots }] = await Promise.all([
			supabase
				.from('pe_appointments')
				.select('room_id, trainer_id')
				.eq('purchase_id', lastPurchase.id)
				.order('date', { ascending: true })
				.limit(1)
				.maybeSingle(),
			getCanonicalPurchaseTimeSlots(
				supabase,
				lastPurchase.id,
				'private',
				packageInfo.weeks_duration
			)
		]);

		if (!refAppointment || !refAppointment.room_id || !refAppointment.trainer_id) {
			return fail(404, {
				success: false,
				message: 'Randevu bilgisi bulunamadı'
			});
		}
		if (timeSlots.length === 0) {
			return fail(404, {
				success: false,
				message: 'Bu paket için ders saatleri belirlenemedi'
			});
		}

		const roomId = refAppointment.room_id;
		const trainerId = refAppointment.trainer_id;

		const lessonsPerWeek = timeSlots.length;
		const weeksPerPurchase = packageInfo.weeks_duration;
		const slotsPerPurchase = weeksPerPurchase * lessonsPerWeek;
		const totalSlots = slotsPerPurchase * packageCount;

		// Build all slots starting from the user-selected appointment
		const startDate = parseLocalDate(startDateStr);
		let allAppointmentSlots: Array<{ date: string; hour: number }>;
		try {
			allAppointmentSlots = buildAppointmentSlotsFromStart(
				startDate,
				startHour,
				timeSlots,
				totalSlots
			);
		} catch (e) {
			return fail(400, {
				success: false,
				message: e instanceof Error ? e.message : 'Başlangıç randevusu hesaplanamadı'
			});
		}

		// One batched conflict check for all slots in the date span.
		const slotDates = allAppointmentSlots.map((s) => s.date);
		const { data: existingAppointments } = await supabase
			.from('pe_appointments')
			.select('date, hour')
			.eq('room_id', roomId)
			.eq('trainer_id', trainerId)
			.in('date', slotDates);

		if (existingAppointments && existingAppointments.length > 0) {
			const occupied = new Set(existingAppointments.map((a) => `${a.date}-${a.hour}`));
			const conflict = allAppointmentSlots.find((s) => occupied.has(`${s.date}-${s.hour}`));
			if (conflict) {
				const dateStr = new Date(conflict.date).toLocaleDateString('tr-TR');
				return fail(400, {
					success: false,
					message: `${dateStr} tarihindeki ${conflict.hour}:00 zaman dilimi zaten dolu`
				});
			}
		}

		const rescheduleLeft = packageInfo.reschedulable ? (packageInfo.reschedule_limit ?? 999) : 0;

		// Chunk pre-built slots into one purchase per package (chronological order
		// preserved) and create everything — purchases, successor links,
		// appointments, enrollments — in one transaction.
		const chunks: ExtensionChunk[] = Array.from({ length: packageCount }, (_, i) => ({
			room_id: roomId,
			trainer_id: trainerId,
			slots: allAppointmentSlots.slice(i * slotsPerPurchase, (i + 1) * slotsPerPurchase)
		}));

		let result: ExtensionResult;
		try {
			result = await new PurchaseRepository(supabase).extend(
				lastPurchase.id,
				rescheduleLeft,
				chunks
			);
		} catch (extendError) {
			return fail(500, {
				success: false,
				message: extendError instanceof Error ? extendError.message : 'Uzatma işlemi başarısız'
			});
		}

		return {
			success: true,
			message: `${result.purchases_created} paket (${result.appointments_created} randevu) başarıyla oluşturuldu`
		};
	},

	extendGroup: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const purchaseId = formData.get('purchase_id') as string;
		const assignmentWeeksStr = formData.get('assignment_weeks') as string;
		const startDateStr = formData.get('start_date') as string;
		const startHour = parseInt(formData.get('start_hour') as string);

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

		if (!startDateStr || isNaN(startHour)) {
			return fail(400, {
				success: false,
				message: 'Başlangıç randevusu seçilmedi'
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
		if (!lastPurchase.package_id || !lastPurchase.team_id) {
			return fail(400, {
				success: false,
				message: 'Paket veya takım bilgisi eksik'
			});
		}

		const packageRes = await supabase
			.from('pe_packages')
			.select('*')
			.eq('id', lastPurchase.package_id)
			.single();

		if (packageRes.error || !packageRes.data) {
			return fail(404, {
				success: false,
				message: 'Paket bilgisi bulunamadı'
			});
		}
		const packageInfo = packageRes.data;
		if (packageInfo.package_type !== 'group') {
			return fail(400, {
				success: false,
				message: 'Bu işlem sadece grup dersleri için geçerlidir'
			});
		}

		// Pull the trainee's actual upcoming group-lesson appointments (already filtered to
		// canonical day/hour). Locate the chosen start, then join the next totalSessions rows.
		// weeksDuration is unused by the group branch of getCanonicalPurchaseTimeSlots, so a
		// null package weeks_duration (group packages set duration per purchase) is fine.
		const startDate = parseLocalDate(startDateStr);
		const { canonicalSlots, upcomingAppointments } = await getFutureGroupAppointments(
			supabase,
			lastPurchase.id,
			startDate,
			packageInfo.weeks_duration ?? 0
		);

		if (canonicalSlots.length === 0 || upcomingAppointments.length === 0) {
			return fail(404, {
				success: false,
				message: 'Bu paket için katılınacak randevu bulunamadı'
			});
		}

		const startIdx = upcomingAppointments.findIndex(
			(a) => a.date === startDateStr && a.hour === startHour
		);
		if (startIdx === -1) {
			return fail(400, {
				success: false,
				message: 'Seçilen başlangıç randevusu bulunamadı'
			});
		}

		const totalSessions = assignmentWeeks * canonicalSlots.length;
		const sessionsToJoin = upcomingAppointments.slice(startIdx, startIdx + totalSessions);

		if (sessionsToJoin.length < totalSessions) {
			return fail(400, {
				success: false,
				message: `${totalSessions} ders için yeterli ileri tarihli randevu yok (${sessionsToJoin.length} mevcut). Grup dersinin randevuları daha ileri tarihe oluşturulmalı.`
			});
		}

		const rescheduleLeft = packageInfo.reschedulable ? (packageInfo.reschedule_limit ?? 999) : 0;

		// New purchase, successor link, and enrollments into the existing group
		// appointments happen in one transaction.
		try {
			await new PurchaseRepository(supabase).extend(lastPurchase.id, rescheduleLeft, [
				{ appointment_ids: sessionsToJoin.map((apt) => apt.appointment_id) }
			]);
		} catch (extendError) {
			return fail(500, {
				success: false,
				message: extendError instanceof Error ? extendError.message : 'Uzatma işlemi başarısız'
			});
		}

		return {
			success: true,
			message: `${assignmentWeeks} haftalık uzatma (${totalSessions} derse katılım) başarıyla oluşturuldu`
		};
	}
};
