import type { SupabaseClientType } from '$lib/types/Supabase';
import type {
	AbsenceResolution,
	MakeupCandidate,
	MissedLesson,
	ShiftPlan
} from '$lib/types/Attendance';
import type { AbsenceOutcome, Attendance, SlotRef } from '$lib/types/Schedule';
import type { ScheduleChange } from '$lib/types/WhatsApp';
import { ConflictService } from '$lib/server/services/conflict-service';
import { PurchaseRepository } from '$lib/server/repositories/purchase-repository';
import { dbErrorMessage } from '$lib/server/db-errors';
import {
	addDays,
	formatDateForDB,
	getDayOfWeekFromDate,
	isAppointmentFuture,
	parseLocalDate
} from '$lib/utils/date-utils';
import {
	compareSlots,
	getStartingAppointmentCandidates,
	memberGroupSessions,
	recurringPattern,
	weeklySlotKey
} from '$lib/utils/slot-utils';

// How far ahead a shifted private lesson looks for a free pattern slot
const SHIFT_PROBE_SLOTS = 12;
// How far ahead make-up sessions are offered
const MAKEUP_WINDOW_DAYS = 28;

const ENROLLMENT_SELECT = `
	trainee_id, purchase_id,
	pe_trainees(name, phone),
	pe_purchases(id, package_id, pe_packages(name, package_type, max_capacity)),
	pe_appointments(date, hour, room_id, trainer_id, group_lesson_id)
` as const;

const SESSION_SELECT = `
	id, date, hour, group_lesson_id,
	pe_rooms(name), pe_trainers(name),
	pe_appointment_trainees(trainee_id)
` as const;

// A decision that could not be made
function failed(outcome: AbsenceOutcome, error: string): AbsenceResolution {
	return { error, outcome, replacement: null, changes: [] };
}

/**
 * Attendance (Yoklama) and what follows an absence. Marking goes through
 * `pe_set_attendance` (trainers may mark their own lessons); a decision about a missed
 * lesson goes through `pe_resolve_absence`, which spends the credit, checks the target and
 * creates the replacement lesson in one transaction. This service plans where a shift
 * goes and lists where a make-up can go.
 */
export class AttendanceService {
	constructor(private supabase: SupabaseClientType) {}

	/** Marks (or clears, with null) a trainee's attendance at a lesson. */
	async mark(enrollmentId: number, attendance: Attendance | null): Promise<string | null> {
		// "" clears the mark (the RPC reads it as NULL)
		const { error } = await this.supabase.rpc('pe_set_attendance', {
			p_enrollment_id: enrollmentId,
			p_attendance: attendance ?? ''
		});
		return error ? dbErrorMessage(error, 'Yoklama kaydedilemedi. Tekrar deneyin.') : null;
	}

	/**
	 * Where a shifted lesson goes: the kayıt's next pattern slot after its last lesson. A
	 * private kayıt gets the first free one (room and trainer of its last lesson); a group
	 * member joins the group lesson's next session on their days with a free seat.
	 */
	async planShift(enrollmentId: number): Promise<ShiftPlan | string> {
		const missed = await this.loadMissed(enrollmentId);
		if (typeof missed === 'string') return missed;
		return missed.isGroup ? this.planGroupShift(missed) : this.planPrivateShift(missed);
	}

	/** Group sessions of the kayıt's package in the next weeks with a free seat. */
	async listMakeupCandidates(enrollmentId: number): Promise<MakeupCandidate[] | string> {
		const missed = await this.loadMissed(enrollmentId);
		if (typeof missed === 'string') return missed;

		const today = formatDateForDB(new Date());
		const { data: lessons, error: lessonsError } = await this.supabase
			.from('pe_group_lessons')
			.select('id')
			.eq('package_id', missed.packageId)
			.or(`end_date.is.null,end_date.gte.${today}`);
		if (lessonsError) {
			return dbErrorMessage(lessonsError, 'Grup dersleri yüklenemedi. Tekrar deneyin.');
		}
		if (!lessons || lessons.length === 0) return [];

		const { data: sessions, error } = await this.supabase
			.from('pe_appointments')
			.select(SESSION_SELECT)
			.in(
				'group_lesson_id',
				lessons.map((l) => l.id)
			)
			.gte('date', today)
			.lte('date', formatDateForDB(addDays(new Date(), MAKEUP_WINDOW_DAYS)))
			.order('date')
			.order('hour');
		if (error) return dbErrorMessage(error, 'Grup dersleri yüklenemedi. Tekrar deneyin.');

		return (sessions ?? []).flatMap((s) => {
			const taken = s.pe_appointment_trainees.length;
			const enrolled = s.pe_appointment_trainees.some((e) => e.trainee_id === missed.traineeId);
			if (!isAppointmentFuture(s.date, s.hour) || enrolled || taken >= missed.capacity) return [];
			return [
				{
					appointmentId: s.id,
					date: s.date,
					hour: s.hour,
					roomName: s.pe_rooms.name ?? '',
					trainerName: s.pe_trainers.name ?? '',
					taken,
					capacity: missed.capacity
				}
			];
		});
	}

	/** Decides a missed lesson: burn it, or replace it (a shift, or a make-up in `targetAppointmentId`). */
	async resolve(params: {
		enrollmentId: number;
		outcome: AbsenceOutcome;
		targetAppointmentId: number | null;
		consumeCredit: boolean;
	}): Promise<AbsenceResolution> {
		const { enrollmentId, outcome, consumeCredit } = params;
		const missed = await this.loadMissed(enrollmentId);
		if (typeof missed === 'string') return failed(outcome, missed);

		let target: number | null = null;
		let newAppointment: { room_id: string; trainer_id: string; date: string; hour: number } | null =
			null;
		let replacement: SlotRef | null = null;
		if (outcome === 'shifted') {
			const plan = await this.planShift(enrollmentId);
			if (typeof plan === 'string') return failed(outcome, plan);
			replacement = { date: plan.date, hour: plan.hour };
			if (plan.appointmentId !== null) target = plan.appointmentId;
			else {
				newAppointment = {
					room_id: plan.roomId,
					trainer_id: plan.trainerId,
					date: plan.date,
					hour: plan.hour
				};
			}
		} else if (outcome === 'makeup') {
			if (params.targetAppointmentId === null) {
				return failed(outcome, 'Telafi için bir grup dersi seçin');
			}
			target = params.targetAppointmentId;
			replacement = await this.sessionSlot(target);
			if (!replacement) return failed(outcome, 'Telafi dersi bulunamadı');
		}

		const { error } = await this.supabase.rpc('pe_resolve_absence', {
			p_enrollment_id: enrollmentId,
			p_outcome: outcome,
			...(target !== null && { p_target_appointment_id: target }),
			...(newAppointment && { p_new_appointment: newAppointment }),
			p_consume_credit: consumeCredit
		});
		if (error)
			return failed(outcome, dbErrorMessage(error, 'Karar kaydedilemedi. Tekrar deneyin.'));

		return {
			error: null,
			outcome,
			replacement,
			changes: replacement ? [this.changeFor(missed, replacement)] : []
		};
	}

	/** Moves a make-up to another session of the same package. */
	async moveMakeup(enrollmentId: number, targetAppointmentId: number): Promise<AbsenceResolution> {
		const makeup = await this.loadMissed(enrollmentId);
		if (typeof makeup === 'string') return failed('makeup', makeup);
		const session = await this.sessionSlot(targetAppointmentId);
		if (!session) return failed('makeup', 'Telafi dersi bulunamadı');
		const { error } = await this.supabase.rpc('pe_move_makeup', {
			p_enrollment_id: enrollmentId,
			p_target_appointment_id: targetAppointmentId
		});
		if (error) {
			return failed('makeup', dbErrorMessage(error, 'Telafi dersi taşınamadı. Tekrar deneyin.'));
		}
		// The message names the session the make-up was in and where it is now
		return {
			error: null,
			outcome: 'makeup',
			replacement: session,
			changes: [this.changeFor(makeup, session)]
		};
	}

	/** Removes a replacement lesson; the missed lesson awaits a decision again. */
	async removeMakeup(enrollmentId: number): Promise<string | null> {
		const { error } = await this.supabase.rpc('pe_remove_makeup', {
			p_enrollment_id: enrollmentId
		});
		return error ? dbErrorMessage(error, 'Telafi dersi kaldırılamadı. Tekrar deneyin.') : null;
	}

	private async sessionSlot(appointmentId: number): Promise<SlotRef | null> {
		const { data } = await this.supabase
			.from('pe_appointments')
			.select('date, hour')
			.eq('id', appointmentId)
			.maybeSingle();
		return data;
	}

	private changeFor(missed: MissedLesson, replacement: SlotRef): ScheduleChange {
		return {
			phone: missed.phone,
			name: missed.traineeName,
			packageName: missed.packageName,
			oldDate: missed.appointment.date,
			oldHour: missed.appointment.hour,
			newDate: replacement.date,
			newHour: replacement.hour
		};
	}

	private async loadMissed(enrollmentId: number): Promise<MissedLesson | string> {
		const { data, error } = await this.supabase
			.from('pe_appointment_trainees')
			.select(ENROLLMENT_SELECT)
			.eq('id', enrollmentId)
			.maybeSingle();
		if (error) return dbErrorMessage(error, 'Öğrenci kaydı yüklenemedi. Tekrar deneyin.');
		if (!data || !data.pe_appointments) return 'Öğrenci kaydı bulunamadı';
		const pkg = data.pe_purchases.pe_packages;
		return {
			traineeId: data.trainee_id,
			traineeName: data.pe_trainees.name,
			phone: data.pe_trainees.phone,
			purchaseId: data.purchase_id,
			packageId: data.pe_purchases.package_id,
			packageName: pkg.name,
			capacity: pkg.max_capacity,
			isGroup: pkg.package_type === 'group',
			appointment: data.pe_appointments
		};
	}

	// The next free pattern slot after the kayıt chain's last lesson, with that lesson's
	// room and trainer
	private async planPrivateShift(missed: MissedLesson): Promise<ShiftPlan | string> {
		const chain = await new PurchaseRepository(this.supabase).getSuccessorChain(missed.purchaseId);
		const { data: lessons, error } = await this.supabase
			.from('pe_appointments')
			.select('id, date, hour, room_id, trainer_id, pe_rooms(name), pe_trainers(name)')
			.in('purchase_id', chain);
		if (error) return dbErrorMessage(error, 'Kaydın dersleri yüklenemedi. Tekrar deneyin.');
		const ordered = (lessons ?? []).sort(compareSlots);
		const last = ordered[ordered.length - 1];
		if (!last) return 'Kaydın dersleri bulunamadı';
		const pattern = recurringPattern(ordered);
		if (pattern.length === 0) return 'Kaydın haftalık düzeni bulunamadı';

		// From the day after the last lesson, never into the past
		const fromDate = new Date(
			Math.max(addDays(parseLocalDate(last.date), 1).getTime(), new Date().setHours(0, 0, 0, 0))
		);
		const conflicts = new ConflictService(this.supabase);
		for (const candidate of getStartingAppointmentCandidates(
			pattern,
			fromDate,
			SHIFT_PROBE_SLOTS
		)) {
			if (!isAppointmentFuture(candidate.date, candidate.hour)) continue;
			const { roomConflict, trainerConflict } = await conflicts.checkAppointmentSlot({
				date: candidate.date,
				hour: candidate.hour,
				roomId: last.room_id,
				trainerId: last.trainer_id
			});
			if (roomConflict || trainerConflict) continue;
			return {
				kind: 'private',
				date: candidate.date,
				hour: candidate.hour,
				roomId: last.room_id,
				trainerId: last.trainer_id,
				roomName: last.pe_rooms.name ?? '',
				trainerName: last.pe_trainers.name ?? '',
				appointmentId: null
			};
		}
		return 'Kaydın düzenindeki sonraki saatler dolu; dersi Taşı ile başka bir saate alın';
	}

	// The next session on the kayıt's weekly slots (in any of its group lessons) after its
	// last lesson, with a free seat
	private async planGroupShift(missed: MissedLesson): Promise<ShiftPlan | string> {
		const chain = await new PurchaseRepository(this.supabase).getSuccessorChain(missed.purchaseId);
		const { data: records, error } = await this.supabase
			.from('pe_appointment_trainees')
			.select('pe_appointments(id, date, hour, group_lesson_id)')
			.eq('trainee_id', missed.traineeId)
			.in('purchase_id', chain)
			.is('makeup_for_id', null);
		if (error) return dbErrorMessage(error, 'Kaydın dersleri yüklenemedi. Tekrar deneyin.');
		const lessons = (records ?? [])
			.flatMap((r) =>
				r.pe_appointments
					? [{ ...r.pe_appointments, groupLessonId: r.pe_appointments.group_lesson_id }]
					: []
			)
			.sort(compareSlots);
		const last = lessons[lessons.length - 1];
		// The slots the kayıt recurs on, one-off moves left out
		const pattern = new Set(recurringPattern(lessons).map(weeklySlotKey));
		const attended = lessons.filter((l) =>
			pattern.has(weeklySlotKey({ day: getDayOfWeekFromDate(l.date), hour: l.hour }))
		);
		const lessonIds = [...new Set(attended.flatMap((l) => l.groupLessonId ?? []))];
		if (!last || lessonIds.length === 0) return 'Kaydın grup dersi bulunamadı';

		const { data: sessions, error: sessionsError } = await this.supabase
			.from('pe_appointments')
			.select(SESSION_SELECT)
			.in('group_lesson_id', lessonIds)
			.gte('date', last.date)
			.order('date')
			.order('hour');
		if (sessionsError) {
			return dbErrorMessage(sessionsError, 'Grup dersleri yüklenemedi. Tekrar deneyin.');
		}
		const candidates = memberGroupSessions(
			attended,
			(sessions ?? []).flatMap((s) =>
				s.group_lesson_id ? [{ ...s, groupLessonId: s.group_lesson_id }] : []
			)
		);
		for (const session of candidates) {
			if (compareSlots(session, last) <= 0 || !isAppointmentFuture(session.date, session.hour)) {
				continue;
			}
			const seats = session.pe_appointment_trainees;
			if (seats.some((e) => e.trainee_id === missed.traineeId)) continue;
			if (seats.length >= missed.capacity) continue;
			const { data: lesson } = await this.supabase
				.from('pe_group_lessons')
				.select('room_id, trainer_id')
				.eq('id', session.groupLessonId)
				.single();
			return {
				kind: 'group',
				date: session.date,
				hour: session.hour,
				roomId: lesson?.room_id ?? '',
				trainerId: lesson?.trainer_id ?? '',
				roomName: session.pe_rooms.name ?? '',
				trainerName: session.pe_trainers.name ?? '',
				appointmentId: session.id
			};
		}
		return 'Kaydırmak için yeterli ileri tarihli grup dersi yok';
	}
}
