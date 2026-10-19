import type { SupabaseClientType } from '$lib/types/Supabase';
import type { AppointmentSlotRef } from '$lib/types/Schedule';
import {
	addDays,
	formatDateForDB,
	getDayOfWeekFromDate,
	parseLocalDate
} from '$lib/utils/date-utils';
import { weeklySlotKey } from '$lib/utils/slot-utils';
import type {
	AppointmentSlotCheck,
	BusyWeeklySlot,
	EnrollmentTargets,
	PlannedMove,
	ResourceConflict,
	SlotConflictQuery,
	SlotConflict,
	EnrollmentTargetCheck
} from '$lib/types/Conflict';
import { dbErrorMessage } from '$lib/server/db-errors';
import { pagedRows } from '$lib/server/paging';

/**
 * Single source of truth for room/trainer booking conflicts.
 * A slot conflicts when the room OR the trainer already has an appointment
 * at the same date and hour — the two resources are checked independently.
 */
export class ConflictService {
	constructor(private supabase: SupabaseClientType) {}

	/**
	 * Batched conflict check: one (paged) query regardless of slot count.
	 * Returns only the slots that conflict.
	 */
	async findSlotConflicts(params: SlotConflictQuery): Promise<SlotConflict[]> {
		const { roomId, trainerId, slots, excludeAppointmentIds = [] } = params;
		if (slots.length === 0) return [];

		// A back-dated kayıt or group lesson spans many weeks of a busy room
		const dates = slots.map((s) => s.date).sort();
		const rows = await pagedRows(
			(from, to) =>
				this.supabase
					.from('pe_appointments')
					.select('id, date, hour, room_id, trainer_id')
					.or(`room_id.eq.${roomId},trainer_id.eq.${trainerId}`)
					.gte('date', dates[0])
					.lte('date', dates[dates.length - 1])
					.order('id')
					.range(from, to),
			'Çakışmalar kontrol edilemedi. Tekrar deneyin.'
		);

		const excluded = new Set(excludeAppointmentIds);
		const slotKey = (date: string, hour: number) => `${date}|${hour}`;

		const occupied = (taken: AppointmentSlotRef[]) =>
			new Set(taken.filter((r) => !excluded.has(r.id)).map((r) => slotKey(r.date, r.hour)));

		const roomTaken = occupied(rows.filter((r) => r.room_id === roomId));
		const trainerTaken = occupied(rows.filter((r) => r.trainer_id === trainerId));

		return slots
			.map((slot) => ({
				...slot,
				roomConflict: roomTaken.has(slotKey(slot.date, slot.hour)),
				trainerConflict: trainerTaken.has(slotKey(slot.date, slot.hour))
			}))
			.filter((c) => c.roomConflict || c.trainerConflict);
	}

	/**
	 * Weekly slots where the room or the trainer is taken on some date from `fromDate`
	 * (inclusive) to `toDate` (exclusive): what a weekly pattern booked over that range
	 * would run into. One query.
	 */
	async findBusyWeeklySlots(params: {
		roomId: string;
		trainerId: string;
		fromDate: string;
		toDate: string;
	}): Promise<BusyWeeklySlot[]> {
		// A long kayıt on a busy room passes PostgREST's 1000-row page
		const data = await pagedRows(
			(from, to) =>
				this.supabase
					.from('pe_appointments')
					.select('date, hour')
					.or(`room_id.eq.${params.roomId},trainer_id.eq.${params.trainerId}`)
					.gte('date', params.fromDate)
					.lt('date', params.toDate)
					.order('id')
					.range(from, to),
			'Çakışmalar kontrol edilemedi. Tekrar deneyin.'
		);

		// Each taken date counts once even when both room and trainer are taken
		const firstWeekEnd = formatDateForDB(addDays(parseLocalDate(params.fromDate), 7));
		const busy = new Map<string, BusyWeeklySlot>();
		for (const { date, hour } of new Map(
			(data ?? []).map((a) => [`${a.date}|${a.hour}`, a] as const)
		).values()) {
			const day = getDayOfWeekFromDate(date);
			const key = weeklySlotKey({ day, hour });
			const slot = busy.get(key) ?? { day, hour, count: 0, first: false };
			slot.count++;
			slot.first ||= date < firstWeekEnd;
			busy.set(key, slot);
		}
		return [...busy.values()];
	}

	/**
	 * Batched conflict check for a set of appointments moving at once (series shifts and
	 * transfers): two queries regardless of size. Rows that are themselves moving don't
	 * count as occupying their old slot, and two moves landing on the same room or trainer
	 * slot conflict with each other.
	 */
	async findMoveConflicts(moves: PlannedMove[]): Promise<SlotConflict[]> {
		if (moves.length === 0) return [];

		const movingIds = new Set(moves.map((m) => m.id));
		const dates = [...new Set(moves.map((m) => m.date))];
		const roomIds = [...new Set(moves.map((m) => m.roomId))];
		const trainerIds = [...new Set(moves.map((m) => m.trainerId))];
		const hours = [...new Set(moves.map((m) => m.hour))];

		const [roomRes, trainerRes] = await Promise.all([
			this.supabase
				.from('pe_appointments')
				.select('id, date, hour, room_id')
				.in('room_id', roomIds)
				.in('date', dates)
				.in('hour', hours),
			this.supabase
				.from('pe_appointments')
				.select('id, date, hour, trainer_id')
				.in('trainer_id', trainerIds)
				.in('date', dates)
				.in('hour', hours)
		]);
		if (roomRes.error)
			throw new Error(
				dbErrorMessage(roomRes.error, 'Çakışmalar kontrol edilemedi. Tekrar deneyin.')
			);
		if (trainerRes.error)
			throw new Error(
				dbErrorMessage(trainerRes.error, 'Çakışmalar kontrol edilemedi. Tekrar deneyin.')
			);

		const roomTaken = new Set(
			(roomRes.data ?? [])
				.filter((r) => !movingIds.has(r.id))
				.map((r) => `${r.room_id}|${r.date}|${r.hour}`)
		);
		const trainerTaken = new Set(
			(trainerRes.data ?? [])
				.filter((r) => !movingIds.has(r.id))
				.map((r) => `${r.trainer_id}|${r.date}|${r.hour}`)
		);

		const conflicts: SlotConflict[] = [];
		for (const move of moves) {
			const roomKey = `${move.roomId}|${move.date}|${move.hour}`;
			const trainerKey = `${move.trainerId}|${move.date}|${move.hour}`;
			const roomConflict = roomTaken.has(roomKey);
			const trainerConflict = trainerTaken.has(trainerKey);
			if (roomConflict || trainerConflict) {
				conflicts.push({ date: move.date, hour: move.hour, roomConflict, trainerConflict });
			}
			roomTaken.add(roomKey);
			trainerTaken.add(trainerKey);
		}
		return conflicts;
	}

	/**
	 * Conflict check for moving a single existing appointment to a (possibly new)
	 * room/trainer. Pass null for a resource that is not changing.
	 */
	async checkAppointmentSlot(params: AppointmentSlotCheck): Promise<ResourceConflict> {
		const { date, hour, roomId, trainerId, excludeAppointmentId } = params;

		const exclude = excludeAppointmentId !== undefined ? [excludeAppointmentId] : [];

		const check = async (column: 'room_id' | 'trainer_id', value: string) => {
			let query = this.supabase
				.from('pe_appointments')
				.select('id')
				.eq(column, value)
				.eq('date', date)
				.eq('hour', hour);
			if (exclude.length > 0) query = query.neq('id', exclude[0]);
			const { data, error } = await query;
			if (error)
				throw new Error(dbErrorMessage(error, 'Çakışmalar kontrol edilemedi. Tekrar deneyin.'));
			return (data ?? []).length > 0;
		};

		const [roomConflict, trainerConflict] = await Promise.all([
			roomId ? check('room_id', roomId) : Promise.resolve(false),
			trainerId ? check('trainer_id', trainerId) : Promise.resolve(false)
		]);

		return { roomConflict, trainerConflict };
	}

	/**
	 * Validates planned enrollments of `traineeIds` into existing `appointmentIds`:
	 * flags trainees already enrolled in a target appointment (regardless of which
	 * purchase enrolled them) and appointments whose package max_capacity would be
	 * exceeded once all the trainees are added. Two queries total.
	 */
	async checkEnrollmentTargets(params: EnrollmentTargets): Promise<EnrollmentTargetCheck> {
		const { appointmentIds, traineeIds } = params;
		if (appointmentIds.length === 0 || traineeIds.length === 0) {
			return { duplicates: [], overCapacity: [] };
		}

		const [targetsRes, enrollmentsRes] = await Promise.all([
			this.supabase
				.from('pe_appointments')
				.select('id, pe_group_lessons(pe_packages(max_capacity))')
				.in('id', appointmentIds),
			this.supabase
				.from('pe_appointment_trainees')
				.select('appointment_id, trainee_id')
				.in('appointment_id', appointmentIds)
		]);

		if (targetsRes.error)
			throw new Error(
				dbErrorMessage(targetsRes.error, 'Randevular kontrol edilemedi. Tekrar deneyin.')
			);
		if (enrollmentsRes.error)
			throw new Error(
				dbErrorMessage(enrollmentsRes.error, 'Kayıtlar kontrol edilemedi. Tekrar deneyin.')
			);

		const traineeSet = new Set(traineeIds);
		const duplicates: EnrollmentTargetCheck['duplicates'] = [];
		const occupancy = new Map<number, number>();

		for (const row of enrollmentsRes.data ?? []) {
			if (row.appointment_id === null) continue;
			occupancy.set(row.appointment_id, (occupancy.get(row.appointment_id) ?? 0) + 1);
			if (row.trainee_id && traineeSet.has(row.trainee_id)) {
				duplicates.push({ appointmentId: row.appointment_id, traineeId: row.trainee_id });
			}
		}

		const overCapacity: EnrollmentTargetCheck['overCapacity'] = [];
		for (const target of targetsRes.data ?? []) {
			const max = target.pe_group_lessons?.pe_packages?.max_capacity;
			if (!max) continue;
			const current = occupancy.get(target.id) ?? 0;
			if (current + traineeIds.length > max) {
				overCapacity.push({ appointmentId: target.id, current, max });
			}
		}

		return { duplicates, overCapacity };
	}
}
