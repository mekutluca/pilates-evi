import type { AssignmentPayload, AssignmentResult } from '$lib/types/Assignment';
import type { SupabaseClientType } from '$lib/types/Supabase';
import type { CancelTraineeAction, OperationResult, TraineeShiftResult } from '$lib/types/Schedule';
import type {
	MoveOutcome,
	RescheduleParams,
	ShiftByWeeksParams,
	TransferParams
} from '$lib/types/Transfer';
import type { CloseDayParams, DayCancellationResult } from '$lib/types/Operation';
import type { DeleteRemainingLessonsResult, RemainingLessonsScope } from '$lib/types';
import { AppointmentRepository } from '$lib/server/repositories/appointment-repository';
import {
	applyPlannedMoves,
	moveFailure,
	shiftSeriesBySlot,
	shiftTraineeRecordsBySlot,
	shiftTraineeRecordsByWeeks
} from '$lib/server/scheduling/shift';
import { cancelAppointment } from '$lib/server/scheduling/cancellation';
import { cancelDay } from '$lib/server/scheduling/day-cancellation';
import { deleteRemainingLessons } from '$lib/server/scheduling/purchase-deletion';
import { addWeeksToDate } from '$lib/utils/date-utils';
import { isValidWeekShift, WEEK_SHIFT_ERROR } from '$lib/utils/validation';

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
			throw new Error(`Atama oluşturulamadı: ${error.message}`);
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
			throw new Error(`Grup dersi sonlandırılamadı: ${error.message}`);
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
		return error ? error.message : null;
	}

	/**
	 * Moves the appointments in `scope` to another room and/or trainer. A series-wide
	 * transfer of a group lesson also moves the lesson itself, so the weekly top-up keeps
	 * generating new weeks with the new room/trainer.
	 */
	async transferResources(params: TransferParams): Promise<MoveOutcome> {
		const { appointmentId, scope, roomId, trainerId } = params;
		if (!roomId && !trainerId) {
			return moveFailure('En az oda veya eğitmen seçilmeli');
		}

		const series = await new AppointmentRepository(this.supabase).getSeries(appointmentId, scope);
		const outcome = await applyPlannedMoves(
			this.supabase,
			series.map((appointment) => ({
				appointment,
				newDate: appointment.date,
				newHour: appointment.hour
			})),
			{ roomId, trainerId }
		);
		if (outcome.error || outcome.conflicts.length > 0) return outcome;

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
					error: 'Grup dersi güncellenirken hata oluştu: ' + error.message,
					conflicts: [],
					moved: outcome.moved
				};
			}
		}
		return outcome;
	}

	/** Moves the appointments in `scope` by whole weeks (negative = earlier). */
	async shiftSeriesByWeeks(params: ShiftByWeeksParams): Promise<MoveOutcome> {
		const { appointmentId, scope, weeks } = params;
		if (!isValidWeekShift(weeks)) return moveFailure(WEEK_SHIFT_ERROR);

		const series = await new AppointmentRepository(this.supabase).getSeries(appointmentId, scope);
		return applyPlannedMoves(
			this.supabase,
			series.map((appointment) => ({
				appointment,
				newDate: addWeeksToDate(appointment.date, weeks),
				newHour: appointment.hour
			}))
		);
	}

	/** Moves a series, from the appointment on, `slots` positions along its weekly pattern. */
	shiftSeriesBySlots(appointmentId: number, slots: number): Promise<MoveOutcome> {
		if (!Number.isInteger(slots) || slots < 1 || slots > 20) {
			return Promise.resolve(moveFailure('Kaydırma sayısı 1 ile 20 arasında olmalı'));
		}
		return shiftSeriesBySlot(this.supabase, appointmentId, slots);
	}

	/** Moves one trainee's group records by whole weeks within their own lessons. */
	shiftTraineeByWeeks(
		appointmentId: number,
		traineeId: string,
		weeks: number
	): Promise<TraineeShiftResult & { skippedCount: number }> {
		return shiftTraineeRecordsByWeeks(this.supabase, appointmentId, traineeId, weeks);
	}

	/** Moves one trainee's group records `slots` positions along their own pattern. */
	shiftTraineeBySlots(
		appointmentId: number,
		traineeId: string,
		slots: number
	): Promise<TraineeShiftResult> {
		return shiftTraineeRecordsBySlot(this.supabase, appointmentId, traineeId, slots);
	}

	/** Cancels one appointment, removing its trainees or shifting their lessons on. */
	cancelAppointment(
		appointmentId: number,
		traineeAction: CancelTraineeAction | null
	): Promise<OperationResult> {
		return cancelAppointment(this.supabase, appointmentId, traineeAction);
	}

	/** Closes a day: shifts every lesson on it forward and removes empty slots. */
	closeDay(params: CloseDayParams): Promise<DayCancellationResult> {
		return cancelDay(this.supabase, params);
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
