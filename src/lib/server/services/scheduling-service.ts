import type { AssignmentPayload, AssignmentResult } from '$lib/types/Assignment';
import type { SupabaseClientType } from '$lib/types/Supabase';
import type { CancelTraineeAction, ChangeOutcome } from '$lib/types/Schedule';
import type {
	MoveOutcome,
	MovePreviewRow,
	MoveRequest,
	MoveResources,
	MoveResult,
	PlacedSlot,
	RescheduleParams
} from '$lib/types/Transfer';
import type { ScheduleChange } from '$lib/types/WhatsApp';
import type { CloseDayParams, CloseDayPreview, DayCancellationResult } from '$lib/types/Operation';
import type { DeleteRemainingLessonsResult, RemainingLessonsScope } from '$lib/types';
import type { GroupLessonMoveInput } from '$lib/types/GroupLesson';
import { AppointmentRepository } from '$lib/server/repositories/appointment-repository';
import {
	applyEnrollmentMoves,
	applyPlannedMoves,
	STARTED_LESSON_ERROR,
	planTraineeSlotShift,
	shiftSeriesBySlot,
	shiftTraineeRecordsByWeeks
} from '$lib/server/scheduling/shift';
import { NotificationService } from '$lib/server/services/notification-service';
import { cancelAppointment } from '$lib/server/scheduling/cancellation';
import { cancelDay, previewCloseDay } from '$lib/server/scheduling/day-cancellation';
import { deleteRemainingLessons } from '$lib/server/scheduling/purchase-deletion';
import { planGroupLessonMove } from '$lib/server/scheduling/group-lessons';
import { toGroupLessonTimeslots } from '$lib/server/scheduling/extension';
import { addWeeksToDate, isAppointmentFuture } from '$lib/utils/date-utils';
import { compareSlots } from '$lib/utils/slot-utils';
import { isValidWeekShift, WEEK_SHIFT_ERROR } from '$lib/utils/validation';
import { dbErrorMessage } from '$lib/server/db-errors';
import { isIntInRange } from '$lib/utils/validation';

// The furthest a series moves by lessons in one Taşı
const MAX_SLOT_SHIFT = 20;

/**
 * The one entry point for scheduling writes. Each operation validates first and writes
 * through a transactional RPC, so a failure leaves no half-applied change. Routes parse
 * input, check permissions, call one method and report the result.
 */
export class SchedulingService {
	constructor(private supabase: SupabaseClientType) {}

	/**
	 * Creates a new assignment — optional group lesson, teams + purchases,
	 * appointments and enrollments — in a single transaction. Validation
	 * (conflicts, capacity, duplicate enrollment) must happen before calling.
	 */
	async createAssignment(payload: AssignmentPayload): Promise<AssignmentResult> {
		const { data, error } = await this.supabase.rpc('pe_create_assignment', {
			p_group_lesson: payload.groupLesson,
			p_purchases: payload.purchases,
			p_appointments: payload.appointments,
			p_enrollments: payload.enrollments
		});
		if (error) {
			throw new Error(
				dbErrorMessage(
					error,
					'Kayıt oluşturulamadı. Seçilen saatler bu arada dolmuş olabilir. Özeti yenileyip tekrar deneyin.'
				)
			);
		}
		// The RPC returns jsonb; its shape is fixed by the SQL function body.
		return data as AssignmentResult;
	}

	/**
	 * Ends a group lesson on the given date: sets end_date and deletes the
	 * pre-created empty appointments from that date on in a single
	 * transaction. The RPC rejects end dates that are not strictly after the
	 * lesson's last appointment with enrolled trainees.
	 */
	async endGroupLesson(groupLessonId: string, endDate: string): Promise<{ deleted_count: number }> {
		const { data, error } = await this.supabase.rpc('pe_end_group_lesson', {
			p_group_lesson_id: groupLessonId,
			p_end_date: endDate
		});
		if (error) {
			throw new Error(
				dbErrorMessage(error, 'Grup dersi sonlandırılamadı. Sayfayı yenileyip tekrar deneyin.')
			);
		}
		// The RPC returns jsonb; its shape is fixed by the SQL function body.
		return data as { deleted_count: number };
	}

	/**
	 * Moves one appointment to another slot (and room). With `consumeCredit` one of the
	 * purchase's reschedule credits is spent in the same transaction. Returns an error
	 * message, or null on success.
	 */
	async reschedule(params: RescheduleParams): Promise<string | null> {
		const { error } = await this.supabase.rpc('pe_reschedule_appointment', {
			p_appointment_id: params.appointmentId,
			p_date: params.date,
			p_hour: params.hour,
			p_room_id: params.roomId,
			p_consume_credit: params.consumeCredit
		});
		return error
			? dbErrorMessage(
					error,
					'Randevu taşınamadı. Saat bu arada dolmuş olabilir. Takvimi yenileyip tekrar deneyin.'
				)
			: null;
	}

	/**
	 * Moves lessons (every kind the Taşı panel offers). With `dryRun` nothing is written:
	 * the same planning and conflict checks run and the result is the preview.
	 */
	async move(request: MoveRequest, dryRun: boolean): Promise<MoveResult> {
		// Lessons that have started stay where they happened
		const anchor = await new AppointmentRepository(this.supabase).getById(request.appointmentId);
		if (!anchor) return moveResultFailure('Randevu bulunamadı');
		if (!isAppointmentFuture(anchor.date, anchor.hour)) {
			return moveResultFailure(STARTED_LESSON_ERROR);
		}
		switch (request.kind) {
			case 'transfer':
				return this.transferResources(request, dryRun);
			case 'weeks': {
				if (!isValidWeekShift(request.weeks)) return moveResultFailure(WEEK_SHIFT_ERROR);
				const series = await new AppointmentRepository(this.supabase).getSeries(
					request.appointmentId,
					request.scope
				);
				const outcome = await applyPlannedMoves(
					this.supabase,
					series.map((appointment) => ({
						appointment,
						newDate: addWeeksToDate(appointment.date, request.weeks),
						newHour: appointment.hour
					})),
					undefined,
					dryRun
				);
				return toMoveResult(outcome, true);
			}
			case 'slots': {
				if (!isIntInRange(request.slots, 1, MAX_SLOT_SHIFT)) {
					return moveResultFailure(`Kaydırma sayısı 1 ile ${MAX_SLOT_SHIFT} arasında olmalı`);
				}
				return toMoveResult(
					await shiftSeriesBySlot(this.supabase, request.appointmentId, request.slots, dryRun),
					true
				);
			}
			case 'trainee_slots': {
				if (!isIntInRange(request.slots, 1, MAX_SLOT_SHIFT)) {
					return moveResultFailure(`Kaydırma sayısı 1 ile ${MAX_SLOT_SHIFT} arasında olmalı`);
				}
				const plan = await planTraineeSlotShift(
					this.supabase,
					request.appointmentId,
					request.traineeId,
					request.slots
				);
				if (plan.error) return moveResultFailure(plan.error);
				if (!dryRun) {
					const moveError = await applyEnrollmentMoves(this.supabase, plan.shifted);
					if (moveError) return moveResultFailure(moveError);
				}
				return this.describeTraineeMoves(
					request.traineeId,
					plan.shifted.map((m) => [m.oldAppointmentId, m.newAppointmentId]),
					0
				);
			}
			case 'trainee_weeks': {
				// The preview runs the same planning (skips, capacity) without writing
				const result = await shiftTraineeRecordsByWeeks(
					this.supabase,
					request.appointmentId,
					request.traineeId,
					request.weeks,
					dryRun
				);
				if (result.error) return moveResultFailure(result.error);
				return this.describeTraineeWeeklyShift(
					request.traineeId,
					result.movingAppointmentIds,
					request.weeks,
					result.skippedCount
				);
			}
		}
	}

	/**
	 * Moves the appointments in `scope` to another room and/or trainer. A series-wide
	 * transfer of a group lesson also moves the lesson itself, so the weekly top-up keeps
	 * generating new weeks with the new room/trainer. The time doesn't change, so there is
	 * nothing to tell clients (no WhatsApp template covers it).
	 */
	private async transferResources(
		request: Extract<MoveRequest, { kind: 'transfer' }>,
		dryRun: boolean
	): Promise<MoveResult> {
		const { appointmentId, scope, roomId, trainerId } = request;
		if (!roomId && !trainerId) {
			return moveResultFailure('Yeni bir oda veya eğitmen seçin');
		}

		const series = await new AppointmentRepository(this.supabase).getSeries(appointmentId, scope);
		const resources = { roomId, trainerId };
		const outcome = await applyPlannedMoves(
			this.supabase,
			series.map((appointment) => ({
				appointment,
				newDate: appointment.date,
				newHour: appointment.hour
			})),
			resources,
			dryRun
		);
		const result = toMoveResult(outcome, false, resources);
		if (dryRun || result.error || result.conflicts.length > 0) return result;

		const groupLessonId = series[0]?.group_lesson_id;
		if (groupLessonId && scope !== 'single') {
			const { error } = await this.supabase
				.from('pe_group_lessons')
				.update({
					...(roomId && { room_id: roomId }),
					...(trainerId && { trainer_id: trainerId })
				})
				.eq('id', groupLessonId);
			if (error) {
				return {
					...result,
					error: dbErrorMessage(
						error,
						'Randevular taşındı ama grup dersi bilgisi güncellenemedi. Grup dersini kontrol edin.'
					)
				};
			}
		}
		return result;
	}

	/**
	 * Moves a group lesson from a date on: new weekly times (same week) and/or a new room
	 * or trainer, then stores the new pattern and resources on the lesson so the weekly
	 * top-up follows them. Only sessions whose time changed produce messages.
	 */
	async moveGroupLesson(input: GroupLessonMoveInput, dryRun: boolean): Promise<MoveResult> {
		const plan = await planGroupLessonMove(this.supabase, input);
		if (typeof plan === 'string') return moveResultFailure(plan);

		const resources = { roomId: input.roomId, trainerId: input.trainerId };
		const outcome = await applyPlannedMoves(this.supabase, plan.moved, resources, dryRun);
		const result = toMoveResult(outcome, false, resources);
		if (result.error) return result;
		const timeMoved = outcome.moved.filter(
			(m) => m.newDate !== m.appointment.date || m.newHour !== m.appointment.hour
		);
		result.changes = NotificationService.changesFromMoves(timeMoved);
		if (dryRun || result.conflicts.length > 0) return result;

		const { error } = await this.supabase
			.from('pe_group_lessons')
			.update({
				timeslots: toGroupLessonTimeslots(plan.slots),
				...(input.roomId && { room_id: input.roomId }),
				...(input.trainerId && { trainer_id: input.trainerId })
			})
			.eq('id', input.groupLessonId);
		if (error) {
			return {
				...result,
				error: dbErrorMessage(
					error,
					'Randevular taşındı ama grup dersi bilgisi güncellenemedi. Grup dersini kontrol edin.'
				)
			};
		}
		return result;
	}

	// Rows and schedule changes for a trainee moving between group appointments
	private async describeTraineeMoves(
		traineeId: string,
		moves: Array<[number, number]>,
		skippedCount: number
	): Promise<MoveResult> {
		const ids = [...new Set(moves.flat())];
		const [{ data: appointments }, { data: trainee }] = await Promise.all([
			this.supabase
				.from('pe_appointments')
				.select('id, date, hour, room_id, trainer_id, pe_group_lessons(pe_packages(name))')
				.in('id', ids),
			this.supabase.from('pe_trainees').select('phone').eq('id', traineeId).maybeSingle()
		]);
		const byId = new Map((appointments ?? []).map((a) => [a.id, a]));

		const rows: MovePreviewRow[] = [];
		const changes: ScheduleChange[] = [];
		for (const [oldId, newId] of moves) {
			const from = byId.get(oldId);
			const to = byId.get(newId);
			if (!from || !to) continue;
			rows.push({ appointmentId: oldId, from: toPlacedSlot(from), to: toPlacedSlot(to) });
			if (trainee) {
				changes.push({
					phone: trainee.phone,
					packageName: from.pe_group_lessons?.pe_packages.name ?? '',
					oldDate: from.date,
					oldHour: from.hour,
					newDate: to.date,
					newHour: to.hour
				});
			}
		}
		return { error: null, conflicts: [], rows, changes, skippedCount };
	}

	// A weekly trainee shift: each moving lesson lands `weeks` later in its own group lesson
	private async describeTraineeWeeklyShift(
		traineeId: string,
		appointmentIds: number[],
		weeks: number,
		skippedCount: number
	): Promise<MoveResult> {
		const [{ data: appointments }, { data: trainee }] = await Promise.all([
			this.supabase
				.from('pe_appointments')
				.select('id, date, hour, room_id, trainer_id, pe_group_lessons(pe_packages(name))')
				.in('id', appointmentIds),
			this.supabase.from('pe_trainees').select('phone').eq('id', traineeId).maybeSingle()
		]);
		const ordered = (appointments ?? []).sort(compareSlots);
		return {
			error: null,
			conflicts: [],
			rows: ordered.map((a) => ({
				appointmentId: a.id,
				from: toPlacedSlot(a),
				to: { ...toPlacedSlot(a), date: addWeeksToDate(a.date, weeks) }
			})),
			changes: trainee
				? ordered.map((a) => ({
						phone: trainee.phone,
						packageName: a.pe_group_lessons?.pe_packages.name ?? '',
						oldDate: a.date,
						oldHour: a.hour,
						newDate: addWeeksToDate(a.date, weeks),
						newHour: a.hour
					}))
				: [],
			skippedCount
		};
	}

	/** Cancels one appointment, removing its trainees or shifting their lessons on. */
	cancelAppointment(
		appointmentId: number,
		traineeAction: CancelTraineeAction | null
	): Promise<ChangeOutcome> {
		return cancelAppointment(this.supabase, appointmentId, traineeAction);
	}

	/** Closes a day: shifts every lesson on it forward and removes empty slots. */
	closeDay(params: CloseDayParams): Promise<DayCancellationResult> {
		return cancelDay(this.supabase, params);
	}

	/** Dry run of closeDay: what would happen to each lesson of the day. */
	previewCloseDay(date: string): Promise<CloseDayPreview> {
		return previewCloseDay(this.supabase, date);
	}

	/** Deletes a trainee's upcoming lessons under one purchase. */
	deleteRemainingLessons(
		purchaseId: string,
		traineeId: string,
		scope: RemainingLessonsScope
	): Promise<DeleteRemainingLessonsResult> {
		return deleteRemainingLessons(this.supabase, purchaseId, traineeId, scope);
	}
}

function moveResultFailure(error: string): MoveResult {
	return { error, conflicts: [], rows: [], changes: [], skippedCount: 0 };
}

function toPlacedSlot(a: {
	date: string;
	hour: number;
	room_id: string;
	trainer_id: string;
}): PlacedSlot {
	return { date: a.date, hour: a.hour, roomId: a.room_id, trainerId: a.trainer_id };
}

// Moved appointments as preview rows; `timeChanges` = whether clients get told (only a
// changed date/hour has a WhatsApp template)
function toMoveResult(
	outcome: MoveOutcome,
	timeChanges: boolean,
	resources?: MoveResources
): MoveResult {
	if (outcome.error) return moveResultFailure(outcome.error);
	return {
		error: null,
		conflicts: outcome.conflicts,
		rows: outcome.moved.map(({ appointment, newDate, newHour }) => ({
			appointmentId: appointment.id,
			from: toPlacedSlot(appointment),
			to: {
				date: newDate,
				hour: newHour,
				roomId: resources?.roomId ?? appointment.room_id,
				trainerId: resources?.trainerId ?? appointment.trainer_id
			}
		})),
		changes: timeChanges ? NotificationService.changesFromMoves(outcome.moved) : [],
		skippedCount: 0
	};
}
