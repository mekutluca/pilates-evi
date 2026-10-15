import type { SupabaseClientType } from '$lib/types/Supabase';
import type {
	AppointmentMove,
	AppointmentSlotRef,
	GroupLessonHorizonInfo,
	MoveTargets,
	ShiftedTraineeRecord,
	SlotRef,
	SlotShiftContext,
	SortedTraineeRecord,
	TraineeGroupSlot,
	TraineeShiftResult,
	TraineeWeeklyShiftResult,
	WeeklyShiftCandidate,
	WeeklyShiftResolution
} from '$lib/types/Schedule';
import type { MovedAppointment, MoveOutcome, MoveResources } from '$lib/types/Transfer';
import type { PlannedMove, SlotConflict } from '$lib/types/Conflict';
import {
	getGroupLessonCanonicalSlots,
	getPurchaseSuccessorChain
} from '$lib/server/scheduling/extension';
import { AppointmentRepository } from '$lib/server/repositories/appointment-repository';
import { ConflictService } from '$lib/server/services/conflict-service';
import {
	addWeeksToDate,
	formatSlotLabel,
	getDayOfWeekFromDate,
	isAppointmentFuture,
	parseLocalDate
} from '$lib/utils/date-utils';
import { isValidWeekShift, WEEK_SHIFT_ERROR } from '$lib/utils/validation';
import {
	buildAppointmentSlotsFromStart,
	compareSlots,
	getStartingAppointmentCandidates,
	isSlotInPattern,
	recurringPattern
} from '$lib/utils/slot-utils';
import { dbErrorMessage } from '$lib/server/db-errors';

export const STARTED_LESSON_ERROR = 'Başlamış veya geçmiş randevular taşınamaz';

function pastTargetError(date: string, hour: number): string {
	return `${formatSlotLabel(date, hour)} geçmişte kalıyor, daha ileri bir tarih seçin`;
}

/** A trainee's weekly shift may not land any of their lessons in the past. */
function pastWeeklyTargetError(candidates: WeeklyShiftCandidate[], weeks: number): string | null {
	const past = candidates.find((c) => !isAppointmentFuture(addWeeksToDate(c.date, weeks), c.hour));
	return past ? pastTargetError(addWeeksToDate(past.date, weeks), past.hour) : null;
}

async function loadSlotShiftContext(
	supabase: SupabaseClientType,
	fromAppointmentId: number
): Promise<SlotShiftContext | string> {
	const series = await new AppointmentRepository(supabase).getSeries(
		fromAppointmentId,
		'from_selected'
	);
	if (series.length === 0) return 'Kaydırılacak randevu bulunamadı';

	// Group lessons follow their stored pattern; private series the one their own
	// appointments form
	const groupLessonId = series[0].group_lesson_id;
	const canonical = groupLessonId
		? (await getGroupLessonCanonicalSlots(supabase, groupLessonId)).slots
		: [];
	const timeSlots = canonical.length > 0 ? canonical : recurringPattern(series);
	if (timeSlots.length === 0) return 'Serinin haftalık düzeni bulunamadı';
	return { series, timeSlots };
}

/**
 * Every appointment of the series moves `slots` positions forward in its pattern. A first
 * lesson that was moved once sits off the pattern: it keeps its place in the order and the
 * pattern continues after it, so shifting it by one takes it to the series' next lesson
 * time and everything after moves along.
 */
function planSlotShift({ series, timeSlots }: SlotShiftContext, slots: number): MovedAppointment[] {
	const [first] = series;
	const total = series.length + slots;
	const firstDate = parseLocalDate(first.date);
	let targets: SlotRef[];
	if (isSlotInPattern(timeSlots, firstDate, first.hour)) {
		targets = buildAppointmentSlotsFromStart(firstDate, first.hour, timeSlots, total);
	} else {
		const next = getStartingAppointmentCandidates(timeSlots, firstDate, timeSlots.length + 1).find(
			(c) => compareSlots(c, first) > 0
		);
		// The pattern has a slot every week, so one comes within a week and a slot of the first
		if (!next) throw new Error('No pattern slot after the first lesson');
		targets = [
			{ date: first.date, hour: first.hour },
			...buildAppointmentSlotsFromStart(parseLocalDate(next.date), next.hour, timeSlots, total - 1)
		];
	}
	return series.map((appointment, i) => ({
		appointment,
		newDate: targets[i + slots].date,
		newHour: targets[i + slots].hour
	}));
}

/** A move that failed before anything was written. */
function moveFailure(error: string): MoveOutcome {
	return { error, conflicts: [], moved: [] };
}

function toPlannedMoves(moved: MovedAppointment[]): PlannedMove[] {
	return moved.map(({ appointment, newDate, newHour }) => ({
		id: appointment.id,
		date: newDate,
		hour: newHour,
		roomId: appointment.room_id,
		trainerId: appointment.trainer_id
	}));
}

/**
 * Applies appointment moves in one transaction (pe_move_appointments). The RPC parks the
 * moving rows before placing them, so a series moved onto its own later slots never trips
 * the unique slot indexes; any real collision rolls the whole move back.
 */
async function applyAppointmentMoves(
	supabase: SupabaseClientType,
	moves: AppointmentMove[]
): Promise<string | null> {
	if (moves.length === 0) return null;
	const { error } = await supabase.rpc('pe_move_appointments', { p_moves: moves });
	return error
		? dbErrorMessage(
				error,
				'Takvim bu arada değişmiş olabilir. Önizlemeyi yenileyip tekrar deneyin.'
			)
		: null;
}

/**
 * Moves enrollment records to other appointments and deletes `emptiedIds` (appointments the
 * moves leave empty) in one transaction (pe_move_enrollments); session numbers follow by
 * trigger.
 */
export async function applyEnrollmentMoves(
	supabase: SupabaseClientType,
	moves: ShiftedTraineeRecord[],
	emptiedIds: number[] = []
): Promise<string | null> {
	if (moves.length === 0 && emptiedIds.length === 0) return null;
	const { error } = await supabase.rpc('pe_move_enrollments', {
		p_moves: moves.map((m) => ({ id: m.recordId, appointment_id: m.newAppointmentId })),
		p_delete_appointment_ids: emptiedIds
	});
	return error
		? dbErrorMessage(
				error,
				'Takvim bu arada değişmiş olabilir. Önizlemeyi yenileyip tekrar deneyin.'
			)
		: null;
}

/**
 * Applies planned appointment moves after a batched conflict check. Conflicts come back
 * without anything written; otherwise the moves are applied in one transaction. With
 * `dryRun` the check runs and nothing is written (previews use the same path).
 */
export async function applyPlannedMoves(
	supabase: SupabaseClientType,
	moved: MovedAppointment[],
	resources?: MoveResources,
	dryRun = false
): Promise<MoveOutcome> {
	if (moved.length === 0) {
		return moveFailure('Taşınacak randevu bulunamadı');
	}
	// Nothing moves out of or into the past
	if (moved.some((m) => !isAppointmentFuture(m.appointment.date, m.appointment.hour))) {
		return moveFailure(STARTED_LESSON_ERROR);
	}
	const pastTarget = moved.find((m) => !isAppointmentFuture(m.newDate, m.newHour));
	if (pastTarget) return moveFailure(pastTargetError(pastTarget.newDate, pastTarget.newHour));
	const planned = toPlannedMoves(moved).map((m) => ({
		...m,
		roomId: resources?.roomId ?? m.roomId,
		trainerId: resources?.trainerId ?? m.trainerId
	}));

	const conflicts = await new ConflictService(supabase).findMoveConflicts(planned);
	if (conflicts.length > 0) return { error: null, conflicts, moved: [] };
	if (dryRun) return { error: null, conflicts: [], moved };

	const moveError = await applyAppointmentMoves(
		supabase,
		planned.map((m) => ({
			id: m.id,
			date: m.date,
			hour: m.hour,
			...(resources?.roomId && { room_id: resources.roomId }),
			...(resources?.trainerId && { trainer_id: resources.trainerId })
		}))
	);
	if (moveError) {
		return moveFailure(moveError);
	}
	return { error: null, conflicts: [], moved };
}

/**
 * Shifts the series containing `fromAppointmentId` forward by `slots` positions in its
 * recurring time-slot pattern (transfer page "Tekli", and a cancelled appointment's
 * series with slots = 1). Private series include their purchase chain; group series
 * leave one-off reschedule destinations out of both the series and the pattern.
 */
export async function shiftSeriesBySlot(
	supabase: SupabaseClientType,
	fromAppointmentId: number,
	slots: number,
	dryRun = false
): Promise<MoveOutcome> {
	if (slots <= 0) {
		return moveFailure('Kaydırma sayısı pozitif olmalı');
	}
	const context = await loadSlotShiftContext(supabase, fromAppointmentId);
	if (typeof context === 'string') return moveFailure(context);

	return applyPlannedMoves(supabase, planSlotShift(context, slots), undefined, dryRun);
}

/**
 * Shifts the series to the nearest offset (minSlots..maxSlots positions) whose every target
 * slot is free — the day-closing "closest free occurrence" resolution. `minSlots` is how
 * many of the series' lessons sit on the closed day, so every one of them leaves it. Plans
 * are checked without writing; only the first conflict-free one is applied.
 */
export async function shiftSeriesToFirstFreeSlot(
	supabase: SupabaseClientType,
	fromAppointmentId: number,
	maxSlots: number,
	minSlots = 1
): Promise<MoveOutcome> {
	const context = await loadSlotShiftContext(supabase, fromAppointmentId);
	if (typeof context === 'string') return moveFailure(context);

	const conflictService = new ConflictService(supabase);
	let lastConflicts: SlotConflict[] = [];
	for (let slots = minSlots; slots < minSlots + maxSlots; slots++) {
		const moved = planSlotShift(context, slots);
		lastConflicts = await conflictService.findMoveConflicts(toPlannedMoves(moved));
		if (lastConflicts.length === 0) return applyPlannedMoves(supabase, moved);
	}
	return { error: null, conflicts: lastConflicts, moved: [] };
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

	const usable: SortedTraineeRecord[] = [];
	for (const row of data ?? []) {
		const apt = row.pe_appointments;
		if (!apt || row.appointment_id === null) continue;
		usable.push({
			recordId: row.id,
			appointmentId: row.appointment_id,
			date: apt.date,
			hour: apt.hour,
			groupLessonId: apt.group_lesson_id
		});
	}
	return usable.sort(compareSlots);
}

/**
 * For each group lesson the trainee attends within these records, returns the upcoming
 * appointments (from `fromDate` onwards) that match the trainee's own (day, hour) pattern
 * inside that group. The slot-shift action and UI preview both rely on this to walk the
 * trainee through their actual schedule rather than the group's full canonical pattern.
 */
async function buildTraineeEligibleByGroup(
	supabase: SupabaseClientType,
	records: TraineeGroupSlot[],
	fromDate: string
): Promise<Map<string, AppointmentSlotRef[]>> {
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

	const eligibleByGroup = new Map<string, AppointmentSlotRef[]>();
	for (const [groupLessonId, slotKeys] of slotKeysByGroup) {
		const { data: groupAppts } = await supabase
			.from('pe_appointments')
			.select('id, date, hour')
			.eq('group_lesson_id', groupLessonId)
			.gte('date', fromDate)
			.order('date', { ascending: true })
			.order('hour', { ascending: true });

		const eligible: AppointmentSlotRef[] = (groupAppts ?? []).filter((a) =>
			slotKeys.has(`${getDayOfWeekFromDate(a.date)}-${a.hour}`)
		);

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
async function resolveWeeklyShiftTargets(
	supabase: SupabaseClientType,
	candidates: WeeklyShiftCandidate[],
	weeks: number,
	dryRun: boolean
): Promise<WeeklyShiftResolution> {
	const lessonCache = new Map<string, GroupLessonHorizonInfo | null>();
	const shiftMap: ShiftedTraineeRecord[] = [];
	const createdIds: number[] = [];
	const toCreateFromIds: number[] = [];
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
			if (dryRun) {
				toCreateFromIds.push(candidate.appointmentId);
				continue;
			}
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
				createdIds.push(created.id);
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

	return { shiftMap, skippedCount, createdIds, toCreateFromIds };
}

async function loadMoveTargets(
	supabase: SupabaseClientType,
	shiftMap: ShiftedTraineeRecord[]
): Promise<MoveTargets | string> {
	const targetIds = [...new Set(shiftMap.map((s) => s.newAppointmentId))];
	const movingRecordIds = new Set(shiftMap.map((s) => s.recordId));

	const { data: targetRows, error: targetsError } = await supabase
		.from('pe_appointments')
		.select('id, pe_group_lessons(pe_packages(max_capacity))')
		.in('id', targetIds);
	if (targetsError) {
		return dbErrorMessage(targetsError, 'Hedef randevular kontrol edilemedi. Tekrar deneyin.');
	}

	const { data: enrollmentRows, error: enrollmentsError } = await supabase
		.from('pe_appointment_trainees')
		.select('id, appointment_id, trainee_id')
		.in('appointment_id', targetIds);
	if (enrollmentsError) {
		return dbErrorMessage(enrollmentsError, 'Hedef randevular kontrol edilemedi. Tekrar deneyin.');
	}

	return {
		targetRows: targetRows ?? [],
		staying: (enrollmentRows ?? []).filter((row) => !movingRecordIds.has(row.id))
	};
}

function findCapacityError(
	{ targetRows, staying }: MoveTargets,
	shiftMap: ShiftedTraineeRecord[]
): string | null {
	const occupancy = new Map<number, number>();
	for (const row of staying) {
		if (row.appointment_id === null) continue;
		occupancy.set(row.appointment_id, (occupancy.get(row.appointment_id) ?? 0) + 1);
	}

	const incoming = new Map<number, number>();
	for (const step of shiftMap) {
		incoming.set(step.newAppointmentId, (incoming.get(step.newAppointmentId) ?? 0) + 1);
	}

	for (const target of targetRows) {
		const maxCapacity = target.pe_group_lessons?.pe_packages.max_capacity;
		if (!maxCapacity) continue;
		const occupied = occupancy.get(target.id) ?? 0;
		const arriving = incoming.get(target.id) ?? 0;
		if (occupied + arriving > maxCapacity) {
			return 'Hedef derste yer yok';
		}
	}
	return null;
}

/**
 * Guards a single-trainee shift against two silent corruptions: enrolling the trainee
 * twice into the same appointment (e.g. via a parallel purchase) and pushing a target
 * appointment over its package's max_capacity. Seats freed by records that are moving
 * out as part of the same shift are not counted as occupied.
 * Returns an error message, or null when all targets are valid.
 */
async function checkTraineeShiftTargets(
	supabase: SupabaseClientType,
	traineeId: string,
	shiftMap: ShiftedTraineeRecord[]
): Promise<string | null> {
	if (shiftMap.length === 0) return null;

	const targets = await loadMoveTargets(supabase, shiftMap);
	if (typeof targets === 'string') return targets;

	if (targets.staying.some((row) => row.trainee_id === traineeId)) {
		return 'Öğrenci hedef randevuya zaten kayıtlı';
	}
	return findCapacityError(targets, shiftMap);
}

/**
 * Capacity check for moves of several trainees planned separately (each plan only saw
 * its own trainee arriving), run on the combined set before it is applied.
 */
export async function checkMoveCapacity(
	supabase: SupabaseClientType,
	shiftMap: ShiftedTraineeRecord[]
): Promise<string | null> {
	if (shiftMap.length === 0) return null;

	const targets = await loadMoveTargets(supabase, shiftMap);
	if (typeof targets === 'string') return targets;
	return findCapacityError(targets, shiftMap);
}

/**
 * Plans moving a single trainee's records, from `fromAppointmentId` on, `slots` positions
 * forward in the trainee's *own* slot pattern within each group lesson they attend,
 * without writing: resolves each record's target appointment and validates the targets.
 *
 * The trainee's own (day, hour) pattern is the right ground truth here — a trainee in a
 * Mon–Sun-at-13:00 group lesson who only attends Wed/Thu must shift Wed→Thu→next-Wed,
 * not Wed→Thu→Fri. When a purchase chain spans multiple group lessons (e.g. trainee
 * attends Wed 13 in one lesson and Sun 10 in another), each record shifts forward inside
 * its own group's pattern.
 *
 */
export async function planTraineeSlotShift(
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
				error: 'Kaydırmak için yeterli ileri tarihli grup dersi yok',
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

	return { error: null, shifted: shiftMap };
}

/**
 * A trainee's group-lesson records from `fromAppointmentId` on, the input of a weekly
 * trainee shift (also used to preview it). Returns an error message when the trainee
 * isn't enrolled there or the lesson isn't a group lesson.
 */
async function listTraineeShiftCandidates(
	supabase: SupabaseClientType,
	fromAppointmentId: number,
	traineeId: string
): Promise<WeeklyShiftCandidate[] | string> {
	const { data: currentRecord } = await supabase
		.from('pe_appointment_trainees')
		.select('purchase_id, pe_appointments(date, hour, group_lesson_id)')
		.eq('appointment_id', fromAppointmentId)
		.eq('trainee_id', traineeId)
		.maybeSingle();
	if (!currentRecord?.pe_appointments) return 'Öğrenci kaydı bulunamadı';
	if (!currentRecord.pe_appointments.group_lesson_id) {
		return 'Bu işlem sadece grup dersleri için geçerlidir';
	}

	const from = currentRecord.pe_appointments;
	return (await getTraineeRecordsForChain(supabase, traineeId, currentRecord.purchase_id)).flatMap(
		(record) =>
			record.groupLessonId && compareSlots(record, from) >= 0
				? [{ ...record, groupLessonId: record.groupLessonId }]
				: []
	);
}

/**
 * Moves a single trainee's group-lesson records, from `fromAppointmentId` on, `weeks`
 * weeks later (or earlier) within their own group lessons, in one transaction. Targets
 * beyond a lesson's generated horizon are created; targets that were cancelled are
 * skipped and counted.
 */
/**
 * Moves a trainee's lessons from `fromAppointmentId` on `weeks` weeks within their group
 * lessons. A target date without a session is skipped (cancelled, or after the lesson ends);
 * one beyond the top-up horizon is created. The dry run (previews) plans and checks the
 * same way and writes nothing.
 */
export async function shiftTraineeRecordsByWeeks(
	supabase: SupabaseClientType,
	fromAppointmentId: number,
	traineeId: string,
	weeks: number,
	dryRun = false
): Promise<TraineeWeeklyShiftResult> {
	const failure = (error: string, skippedCount = 0): TraineeWeeklyShiftResult => ({
		error,
		shifted: [],
		skippedCount,
		movingAppointmentIds: []
	});
	if (!isValidWeekShift(weeks)) return failure(WEEK_SHIFT_ERROR);

	const candidates = await listTraineeShiftCandidates(supabase, fromAppointmentId, traineeId);
	if (typeof candidates === 'string') return failure(candidates);
	const pastError = pastWeeklyTargetError(candidates, weeks);
	if (pastError) return failure(pastError);

	const { shiftMap, skippedCount, createdIds, toCreateFromIds } = await resolveWeeklyShiftTargets(
		supabase,
		candidates,
		weeks,
		dryRun
	);
	// Sessions created for this shift go again when it doesn't happen, so they don't hold
	// the room and trainer
	const fail = async (error: string) => {
		if (createdIds.length > 0) {
			await supabase.from('pe_appointments').delete().in('id', createdIds);
		}
		return failure(error, skippedCount);
	};
	if (candidates.length > 0 && shiftMap.length + toCreateFromIds.length === 0) {
		return fail('Kaydırılacak randevu yok, hedef tarihlerdeki derslerin hepsi iptal edilmiş');
	}

	const guardError = await checkTraineeShiftTargets(supabase, traineeId, shiftMap);
	if (guardError) return fail(guardError);

	const movingAppointmentIds = [...shiftMap.map((m) => m.oldAppointmentId), ...toCreateFromIds];
	if (dryRun) return { error: null, shifted: shiftMap, skippedCount, movingAppointmentIds };

	const moveError = await applyEnrollmentMoves(supabase, shiftMap);
	if (moveError) return fail(moveError);
	return { error: null, shifted: shiftMap, skippedCount, movingAppointmentIds };
}
