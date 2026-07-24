import type { SupabaseClientType } from '$lib/types/Supabase';
import type {
	DayOfWeek,
	EligibleAppointment,
	GroupLessonHorizonInfo,
	RawAppointmentRow,
	SeriesShiftResult,
	ShiftableAppointment,
	ShiftConflict,
	ShiftedAppointment,
	ShiftedTraineeRecord,
	SortedTraineeRecord,
	TraineeRecordRow,
	TraineeShiftResult,
	WeeklyShiftCandidate,
	WeeklyShiftResolution
} from '$lib/types/Schedule';
import {
	getGroupLessonCanonicalSlots,
	getPurchaseSuccessorChain
} from '$lib/utils/extension-utils';
import { addWeeksToDate, buildAppointmentSlots, getDayOfWeekFromDate } from '$lib/utils/date-utils';
import { sortTimeSlotsSundayFirst } from '$lib/utils/slot-utils';

const APPOINTMENT_FIELDS = 'id, date, hour, room_id, trainer_id, purchase_id, group_lesson_id';

function isCompleteAppointment(row: RawAppointmentRow): row is ShiftableAppointment {
	return !!row.date && row.hour !== null;
}

function sortByDateHour<T extends { date: string; hour: number }>(items: T[]): T[] {
	return [...items].sort((a, b) => {
		const dc = a.date.localeCompare(b.date);
		if (dc !== 0) return dc;
		return a.hour - b.hour;
	});
}

async function getSeriesAppointments(
	supabase: SupabaseClientType,
	from: ShiftableAppointment
): Promise<ShiftableAppointment[]> {
	if (from.purchase_id) {
		const chain = await getPurchaseSuccessorChain(supabase, from.purchase_id);
		const { data } = await supabase
			.from('pe_appointments')
			.select(APPOINTMENT_FIELDS)
			.in('purchase_id', chain)
			.or(`date.gt.${from.date},and(date.eq.${from.date},hour.gte.${from.hour})`)
			.order('date', { ascending: true })
			.order('hour', { ascending: true });
		return ((data as RawAppointmentRow[] | null) ?? []).filter(isCompleteAppointment);
	}

	if (from.group_lesson_id) {
		const { data } = await supabase
			.from('pe_appointments')
			.select(APPOINTMENT_FIELDS)
			.eq('group_lesson_id', from.group_lesson_id)
			.or(`date.gt.${from.date},and(date.eq.${from.date},hour.gte.${from.hour})`)
			.order('date', { ascending: true })
			.order('hour', { ascending: true });
		const rows = ((data as RawAppointmentRow[] | null) ?? []).filter(isCompleteAppointment);
		const { slotKeys } = await getGroupLessonCanonicalSlots(supabase, from.group_lesson_id);
		if (slotKeys.size === 0) return rows;
		return rows.filter((a) => slotKeys.has(`${getDayOfWeekFromDate(a.date)}-${a.hour}`));
	}

	return [];
}

async function getRecurringTimeSlots(
	supabase: SupabaseClientType,
	from: ShiftableAppointment,
	appointments: ShiftableAppointment[]
): Promise<Array<{ day: DayOfWeek; hour: number }>> {
	if (from.group_lesson_id) {
		const { slots } = await getGroupLessonCanonicalSlots(supabase, from.group_lesson_id);
		if (slots.length > 0) return slots;
	}

	const seen = new Set<string>();
	const result: Array<{ day: DayOfWeek; hour: number }> = [];
	for (const apt of appointments) {
		const day = getDayOfWeekFromDate(apt.date);
		const key = `${day}-${apt.hour}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push({ day, hour: apt.hour });
	}
	return sortTimeSlotsSundayFirst(result);
}

async function findSeriesShiftConflicts(
	supabase: SupabaseClientType,
	plan: Array<{ source: ShiftableAppointment; newDate: string; newHour: number }>,
	seriesIds: Set<number>
): Promise<ShiftConflict[]> {
	const conflicts: ShiftConflict[] = [];
	for (const { source, newDate, newHour } of plan) {
		let roomConflict = false;
		let trainerConflict = false;

		if (source.room_id) {
			const { data } = await supabase
				.from('pe_appointments')
				.select('id')
				.eq('room_id', source.room_id)
				.eq('date', newDate)
				.eq('hour', newHour)
				.neq('id', source.id);
			roomConflict = !!data?.some((row) => !seriesIds.has(row.id));
		}

		if (source.trainer_id) {
			const { data } = await supabase
				.from('pe_appointments')
				.select('id')
				.eq('trainer_id', source.trainer_id)
				.eq('date', newDate)
				.eq('hour', newHour)
				.neq('id', source.id);
			trainerConflict = !!data?.some((row) => !seriesIds.has(row.id));
		}

		if (roomConflict || trainerConflict) {
			conflicts.push({ date: newDate, hour: newHour, roomConflict, trainerConflict });
		}
	}
	return conflicts;
}

/**
 * Shifts the series containing `fromAppointmentId` forward by `slots` positions in its
 * recurring time-slot pattern. Used by both the transfer page (user-supplied slots) and
 * the cancellation flow (slots = 1 on the cancelled appointment).
 *
 * - Private (purchase-backed) series: timeslots are inferred from the existing future
 *   appointments; the purchase successor chain is included so extensions move with it.
 * - Group lesson series: timeslots come from `pe_group_lessons.timeslots` and off-pattern
 *   appointments (one-off reschedule destinations) are excluded from both the series and
 *   the recurring pattern.
 *
 * Conflicts (room/trainer at the new slot, ignoring members of the same series) are
 * surfaced via the result without applying the shift. Updates are committed in reverse
 * order so intra-series collisions on `(date, hour)` never appear mid-write.
 *
 * With `options.force`, the shift is applied even when conflicts exist (the conflicts are
 * still returned for the caller's reference) — used by the day-cancellation "shift anyway"
 * resolution where the user has accepted the overlap.
 */
export async function shiftSeriesBySlot(
	supabase: SupabaseClientType,
	fromAppointmentId: number,
	slots: number,
	options?: { force?: boolean }
): Promise<SeriesShiftResult> {
	if (slots <= 0) {
		return { error: 'Kaydırma sayısı pozitif olmalı', conflicts: [], shifted: [] };
	}

	const { data: rawFrom } = await supabase
		.from('pe_appointments')
		.select(APPOINTMENT_FIELDS)
		.eq('id', fromAppointmentId)
		.single();

	if (!rawFrom || !isCompleteAppointment(rawFrom as RawAppointmentRow)) {
		return { error: 'Randevu bulunamadı', conflicts: [], shifted: [] };
	}
	const from = rawFrom as ShiftableAppointment;

	const series = await getSeriesAppointments(supabase, from);
	if (series.length === 0) {
		return { error: 'Kaydırılacak randevu bulunamadı', conflicts: [], shifted: [] };
	}

	const timeSlots = await getRecurringTimeSlots(supabase, from, series);
	if (timeSlots.length === 0) {
		return { error: 'Ders saatleri çıkarılamadı', conflicts: [], shifted: [] };
	}

	const totalSlotsNeeded = series.length + slots;
	const startDate = new Date(series[0].date);
	const allSlots = buildAppointmentSlots(timeSlots, startDate, totalSlotsNeeded);

	const plan: Array<{ source: ShiftableAppointment; newDate: string; newHour: number }> = [];
	for (let i = 0; i < series.length; i++) {
		const target = allSlots[i + slots];
		if (!target) continue;
		plan.push({ source: series[i], newDate: target.date, newHour: target.hour });
	}

	if (plan.length === 0) {
		return { error: 'Kaydırılacak randevu bulunamadı', conflicts: [], shifted: [] };
	}

	const seriesIds = new Set(series.map((a) => a.id));
	const conflicts = await findSeriesShiftConflicts(supabase, plan, seriesIds);
	if (conflicts.length > 0 && !options?.force) {
		return { error: null, conflicts, shifted: [] };
	}

	for (const step of [...plan].reverse()) {
		const { error } = await supabase
			.from('pe_appointments')
			.update({ date: step.newDate, hour: step.newHour })
			.eq('id', step.source.id);
		if (error) {
			return {
				error: 'Kaydırma sırasında hata oluştu: ' + error.message,
				conflicts: [],
				shifted: []
			};
		}
	}

	const shifted: ShiftedAppointment[] = plan.map((step) => ({
		id: step.source.id,
		oldDate: step.source.date,
		oldHour: step.source.hour,
		newDate: step.newDate,
		newHour: step.newHour,
		roomId: step.source.room_id,
		trainerId: step.source.trainer_id,
		purchaseId: step.source.purchase_id,
		groupLessonId: step.source.group_lesson_id
	}));

	return { error: null, conflicts, shifted };
}

async function getTraineeRecordsForChain(
	supabase: SupabaseClientType,
	traineeId: string,
	purchaseId: string
): Promise<SortedTraineeRecord[]> {
	const chain = await getPurchaseSuccessorChain(supabase, purchaseId);
	const { data } = await supabase
		.from('pe_appointment_trainees')
		.select('id, appointment_id, purchase_id, pe_appointments(id, date, hour, group_lesson_id)')
		.eq('trainee_id', traineeId)
		.in('purchase_id', chain);

	const rows = (data ?? []) as TraineeRecordRow[];
	const usable: SortedTraineeRecord[] = [];
	for (const row of rows) {
		const apt = row.pe_appointments;
		if (!apt?.date || apt.hour === null || row.appointment_id === null) continue;
		usable.push({
			recordId: row.id,
			appointmentId: row.appointment_id,
			date: apt.date,
			hour: apt.hour,
			groupLessonId: apt.group_lesson_id
		});
	}
	return sortByDateHour(usable);
}

/**
 * Reassigns `session_number` 1..N within each purchase of `chain` for the given trainee
 * so the numbering matches the records' chronological order. `total_sessions` is left
 * alone (the package's session count doesn't change when records move between
 * appointments). Run this after any shift that changes individual records'
 * `appointment_id` — whole-series shifts move every appointment uniformly so they
 * preserve order without help.
 */
export async function renumberTraineeSessionsInChain(
	supabase: SupabaseClientType,
	traineeId: string,
	chain: string[]
): Promise<{ error: string | null }> {
	for (const purchaseId of chain) {
		const { data } = await supabase
			.from('pe_appointment_trainees')
			.select('id, session_number, pe_appointments(date, hour)')
			.eq('trainee_id', traineeId)
			.eq('purchase_id', purchaseId);

		const rows = (data ?? []) as Array<{
			id: number;
			session_number: number | null;
			pe_appointments: { date: string | null; hour: number | null } | null;
		}>;

		const sorted = rows
			.filter((r) => r.pe_appointments?.date && r.pe_appointments.hour !== null)
			.sort((a, b) => {
				const dc = (a.pe_appointments?.date ?? '').localeCompare(b.pe_appointments?.date ?? '');
				if (dc !== 0) return dc;
				return (a.pe_appointments?.hour ?? 0) - (b.pe_appointments?.hour ?? 0);
			});

		for (let i = 0; i < sorted.length; i++) {
			const expected = i + 1;
			if (sorted[i].session_number === expected) continue;
			const { error } = await supabase
				.from('pe_appointment_trainees')
				.update({ session_number: expected })
				.eq('id', sorted[i].id);
			if (error) {
				return { error: 'Ders numaraları güncellenirken hata: ' + error.message };
			}
		}
	}
	return { error: null };
}

/**
 * For each group lesson the trainee attends within these records, returns the upcoming
 * appointments (from `fromDate` onwards) that match the trainee's own (day, hour) pattern
 * inside that group. The slot-shift action and UI preview both rely on this to walk the
 * trainee through their actual schedule rather than the group's full canonical pattern.
 */
export async function buildTraineeEligibleByGroup(
	supabase: SupabaseClientType,
	records: Array<{ groupLessonId: string | null; date: string; hour: number }>,
	fromDate: string
): Promise<Map<string, EligibleAppointment[]>> {
	const slotKeysByGroup = new Map<string, Set<string>>();
	for (const record of records) {
		if (!record.groupLessonId) continue;
		let set = slotKeysByGroup.get(record.groupLessonId);
		if (!set) {
			set = new Set<string>();
			slotKeysByGroup.set(record.groupLessonId, set);
		}
		set.add(`${getDayOfWeekFromDate(record.date)}-${record.hour}`);
	}

	const eligibleByGroup = new Map<string, EligibleAppointment[]>();
	for (const [groupLessonId, slotKeys] of slotKeysByGroup) {
		const { data: groupAppts } = await supabase
			.from('pe_appointments')
			.select('id, date, hour')
			.eq('group_lesson_id', groupLessonId)
			.gte('date', fromDate)
			.order('date', { ascending: true })
			.order('hour', { ascending: true });

		const eligible = (
			(groupAppts as Array<{ id: number; date: string | null; hour: number | null }> | null) ?? []
		)
			.filter((a): a is EligibleAppointment => !!a.date && a.hour !== null)
			.filter((a) => slotKeys.has(`${getDayOfWeekFromDate(a.date)}-${a.hour}`));

		eligibleByGroup.set(groupLessonId, eligible);
	}
	return eligibleByGroup;
}

async function getGroupLessonHorizonInfo(
	supabase: SupabaseClientType,
	groupLessonId: string,
	cache: Map<string, GroupLessonHorizonInfo | null>
): Promise<GroupLessonHorizonInfo | null> {
	if (!cache.has(groupLessonId)) {
		const { data: lesson } = await supabase
			.from('pe_group_lessons')
			.select('room_id, trainer_id, organization_id, appointments_created_until, end_date')
			.eq('id', groupLessonId)
			.single();
		cache.set(groupLessonId, lesson);
	}
	return cache.get(groupLessonId) ?? null;
}

/**
 * Resolves each candidate's target appointment for a weeks-based trainee shift.
 *
 * Group lesson appointments are only pre-generated up to `appointments_created_until`
 * (rolling ~26-week horizon, topped up weekly by cron). When the target date/hour has no
 * row yet:
 * - if it's beyond that horizon (and still within the lesson's `end_date`, if any), the
 *   slot just hasn't been created yet — it's created now, matching the lesson's room/trainer;
 * - otherwise the slot existed and was actively cancelled (e.g. a holiday) — the candidate
 *   is skipped rather than aborting the whole shift.
 */
export async function resolveWeeklyShiftTargets(
	supabase: SupabaseClientType,
	candidates: WeeklyShiftCandidate[],
	weeks: number
): Promise<WeeklyShiftResolution> {
	const lessonCache = new Map<string, GroupLessonHorizonInfo | null>();
	const shiftMap: ShiftedTraineeRecord[] = [];
	let skippedCount = 0;

	for (const candidate of candidates) {
		const targetDate = addWeeksToDate(candidate.date, weeks);

		const { data: targetAppt } = await supabase
			.from('pe_appointments')
			.select('id')
			.eq('group_lesson_id', candidate.groupLessonId)
			.eq('date', targetDate)
			.eq('hour', candidate.hour)
			.single();

		if (targetAppt) {
			shiftMap.push({
				recordId: candidate.recordId,
				oldAppointmentId: candidate.appointmentId,
				newAppointmentId: targetAppt.id
			});
			continue;
		}

		const lesson = await getGroupLessonHorizonInfo(supabase, candidate.groupLessonId, lessonCache);
		const beyondHorizon =
			!!lesson?.appointments_created_until && targetDate > lesson.appointments_created_until;
		const withinLessonLifetime = !lesson?.end_date || targetDate <= lesson.end_date;

		if (lesson && beyondHorizon && withinLessonLifetime && lesson.room_id && lesson.trainer_id) {
			const { data: created } = await supabase
				.from('pe_appointments')
				.insert({
					room_id: lesson.room_id,
					trainer_id: lesson.trainer_id,
					organization_id: lesson.organization_id,
					group_lesson_id: candidate.groupLessonId,
					date: targetDate,
					hour: candidate.hour
				})
				.select('id')
				.single();

			if (created) {
				shiftMap.push({
					recordId: candidate.recordId,
					oldAppointmentId: candidate.appointmentId,
					newAppointmentId: created.id
				});
				continue;
			}
			// Insert failed (e.g. room/trainer already booked at that slot) — treat as skip.
		}

		skippedCount++;
	}

	return { shiftMap, skippedCount };
}

/**
 * Guards a single-trainee shift against two silent corruptions: enrolling the trainee
 * twice into the same appointment (e.g. via a parallel purchase) and pushing a target
 * appointment over its package's max_capacity. Seats freed by records that are moving
 * out as part of the same shift are not counted as occupied.
 * Returns an error message, or null when all targets are valid.
 */
export async function checkTraineeShiftTargets(
	supabase: SupabaseClientType,
	traineeId: string,
	shiftMap: ShiftedTraineeRecord[]
): Promise<string | null> {
	if (shiftMap.length === 0) return null;

	const targetIds = [...new Set(shiftMap.map((s) => s.newAppointmentId))];
	const movingRecordIds = new Set(shiftMap.map((s) => s.recordId));

	const { data: targetRows, error: targetsError } = await supabase
		.from('pe_appointments')
		.select('id, pe_group_lessons(pe_packages(max_capacity))')
		.in('id', targetIds);
	if (targetsError) {
		return 'Hedef randevular kontrol edilirken hata: ' + targetsError.message;
	}

	const { data: enrollmentRows, error: enrollmentsError } = await supabase
		.from('pe_appointment_trainees')
		.select('id, appointment_id, trainee_id')
		.in('appointment_id', targetIds);
	if (enrollmentsError) {
		return 'Hedef randevu kayıtları kontrol edilirken hata: ' + enrollmentsError.message;
	}

	const staying = (enrollmentRows ?? []).filter((row) => !movingRecordIds.has(row.id));

	const duplicate = staying.find((row) => row.trainee_id === traineeId);
	if (duplicate) {
		return 'Öğrenci hedef randevuya zaten kayıtlı';
	}

	const occupancy = new Map<number, number>();
	for (const row of staying) {
		if (row.appointment_id === null) continue;
		occupancy.set(row.appointment_id, (occupancy.get(row.appointment_id) ?? 0) + 1);
	}

	const incoming = new Map<number, number>();
	for (const step of shiftMap) {
		incoming.set(step.newAppointmentId, (incoming.get(step.newAppointmentId) ?? 0) + 1);
	}

	for (const target of targetRows ?? []) {
		const maxCapacity = target.pe_group_lessons?.pe_packages?.max_capacity;
		if (!maxCapacity) continue;
		const occupied = occupancy.get(target.id) ?? 0;
		const arriving = incoming.get(target.id) ?? 0;
		if (occupied + arriving > maxCapacity) {
			return 'Hedef randevu kapasitesi dolu, kaydırma yapılamaz';
		}
	}

	return null;
}

/**
 * Shifts a single trainee's records, starting at `fromAppointmentId`, forward by `slots`
 * positions in the trainee's *own* slot pattern within each group lesson they attend.
 *
 * The trainee's own (day, hour) pattern is the right ground truth here — a trainee in a
 * Mon–Sun-at-13:00 group lesson who only attends Wed/Thu must shift Wed→Thu→next-Wed,
 * not Wed→Thu→Fri. When a purchase chain spans multiple group lessons (e.g. trainee
 * attends Wed 13 in one lesson and Sun 10 in another), each record shifts forward inside
 * its own group's pattern.
 *
 * Updates run in reverse order so that the trainee never momentarily holds two records
 * on the same appointment.
 */
export async function shiftTraineeRecordsBySlot(
	supabase: SupabaseClientType,
	fromAppointmentId: number,
	traineeId: string,
	slots: number
): Promise<TraineeShiftResult> {
	if (slots <= 0) {
		return { error: 'Kaydırma sayısı pozitif olmalı', shifted: [] };
	}

	const { data: currentRecord } = await supabase
		.from('pe_appointment_trainees')
		.select('id, purchase_id, pe_appointments(id, date, hour, group_lesson_id)')
		.eq('appointment_id', fromAppointmentId)
		.eq('trainee_id', traineeId)
		.single();

	if (!currentRecord || !currentRecord.pe_appointments || !currentRecord.purchase_id) {
		return { error: 'Öğrenci kaydı bulunamadı', shifted: [] };
	}

	if (!currentRecord.pe_appointments.group_lesson_id) {
		return { error: 'Bu işlem sadece grup dersleri için geçerlidir', shifted: [] };
	}

	const fromDate = currentRecord.pe_appointments.date;
	if (!fromDate) {
		return { error: 'Randevu tarihi yok', shifted: [] };
	}

	const records = await getTraineeRecordsForChain(supabase, traineeId, currentRecord.purchase_id);
	const startIndex = records.findIndex((r) => r.appointmentId === fromAppointmentId);
	if (startIndex === -1) {
		return { error: 'Başlangıç randevusu bulunamadı', shifted: [] };
	}

	const eligibleByGroup = await buildTraineeEligibleByGroup(supabase, records, fromDate);

	const recordsToShift = records.slice(startIndex);
	const shiftMap: ShiftedTraineeRecord[] = [];
	for (const record of recordsToShift) {
		if (!record.groupLessonId) continue;
		const eligible = eligibleByGroup.get(record.groupLessonId);
		if (!eligible) continue;
		const currentIdx = eligible.findIndex((a) => a.id === record.appointmentId);
		if (currentIdx === -1) continue;
		const targetIdx = currentIdx + slots;
		if (targetIdx >= eligible.length) {
			return {
				error: 'Kaydırma için yeterli ileri tarihli grup dersi randevusu yok',
				shifted: []
			};
		}
		shiftMap.push({
			recordId: record.recordId,
			oldAppointmentId: record.appointmentId,
			newAppointmentId: eligible[targetIdx].id
		});
	}

	const guardError = await checkTraineeShiftTargets(supabase, traineeId, shiftMap);
	if (guardError) {
		return { error: guardError, shifted: [] };
	}

	for (const step of [...shiftMap].reverse()) {
		const { error } = await supabase
			.from('pe_appointment_trainees')
			.update({ appointment_id: step.newAppointmentId })
			.eq('id', step.recordId);
		if (error) {
			return { error: 'Öğrenci kaydırma sırasında hata oluştu: ' + error.message, shifted: [] };
		}
	}

	if (shiftMap.length > 0) {
		const chain = await getPurchaseSuccessorChain(supabase, currentRecord.purchase_id);
		const renumber = await renumberTraineeSessionsInChain(supabase, traineeId, chain);
		if (renumber.error) {
			return { error: renumber.error, shifted: [] };
		}
	}

	return { error: null, shifted: shiftMap };
}
