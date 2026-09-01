import type { SupabaseClientType } from '$lib/types/Supabase';
import type {
	SlotRef,
	SlotConflict,
	OccupiedSlot,
	EnrollmentTargetCheck
} from '$lib/types/Conflict';

/**
 * Single source of truth for room/trainer booking conflicts.
 * A slot conflicts when the room OR the trainer already has an appointment
 * at the same date and hour — the two resources are checked independently.
 */
export class ConflictService {
	constructor(private supabase: SupabaseClientType) {}

	/**
	 * Batched conflict check: 2 queries total regardless of slot count.
	 * Returns only the slots that conflict.
	 */
	async findSlotConflicts(params: {
		roomId: string;
		trainerId: string;
		slots: SlotRef[];
		excludeAppointmentIds?: number[];
	}): Promise<SlotConflict[]> {
		const { roomId, trainerId, slots, excludeAppointmentIds = [] } = params;
		if (slots.length === 0) return [];

		const dates = [...new Set(slots.map((s) => s.date))];

		const [roomRes, trainerRes] = await Promise.all([
			this.supabase
				.from('pe_appointments')
				.select('id, date, hour')
				.eq('room_id', roomId)
				.in('date', dates),
			this.supabase
				.from('pe_appointments')
				.select('id, date, hour')
				.eq('trainer_id', trainerId)
				.in('date', dates)
		]);

		if (roomRes.error) throw new Error(`Çakışma kontrolü başarısız: ${roomRes.error.message}`);
		if (trainerRes.error)
			throw new Error(`Çakışma kontrolü başarısız: ${trainerRes.error.message}`);

		const excluded = new Set(excludeAppointmentIds);
		const slotKey = (date: string | null, hour: number | null) => `${date}|${hour}`;

		const occupied = (rows: Array<{ id: number; date: string | null; hour: number | null }>) =>
			new Set(rows.filter((r) => !excluded.has(r.id)).map((r) => slotKey(r.date, r.hour)));

		const roomTaken = occupied(roomRes.data ?? []);
		const trainerTaken = occupied(trainerRes.data ?? []);

		return slots
			.map((slot) => ({
				...slot,
				roomConflict: roomTaken.has(slotKey(slot.date, slot.hour)),
				trainerConflict: trainerTaken.has(slotKey(slot.date, slot.hour))
			}))
			.filter((c) => c.roomConflict || c.trainerConflict);
	}

	/**
	 * Conflict check for moving a single existing appointment to a (possibly new)
	 * room/trainer. Pass null for a resource that is not changing.
	 */
	async checkAppointmentSlot(params: {
		date: string;
		hour: number;
		roomId: string | null;
		trainerId: string | null;
		excludeAppointmentId?: number;
	}): Promise<{ roomConflict: boolean; trainerConflict: boolean }> {
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
			if (error) throw new Error(`Çakışma kontrolü başarısız: ${error.message}`);
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
	async checkEnrollmentTargets(params: {
		appointmentIds: number[];
		traineeIds: string[];
	}): Promise<EnrollmentTargetCheck> {
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
			throw new Error(`Randevular kontrol edilemedi: ${targetsRes.error.message}`);
		if (enrollmentsRes.error)
			throw new Error(`Kayıtlar kontrol edilemedi: ${enrollmentsRes.error.message}`);

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

	/**
	 * All appointments occupying the room or the trainer within a date range.
	 * Used by clients to preview availability. Two .eq() queries merged —
	 * no string-interpolated or() filters.
	 */
	async getOccupiedSlots(params: {
		roomId: string;
		trainerId: string;
		startDate: string;
		endDate: string;
	}): Promise<OccupiedSlot[]> {
		const { roomId, trainerId, startDate, endDate } = params;

		const select = 'id, room_id, trainer_id, date, hour';
		const [roomRes, trainerRes] = await Promise.all([
			this.supabase
				.from('pe_appointments')
				.select(select)
				.eq('room_id', roomId)
				.gte('date', startDate)
				.lte('date', endDate),
			this.supabase
				.from('pe_appointments')
				.select(select)
				.eq('trainer_id', trainerId)
				.gte('date', startDate)
				.lte('date', endDate)
		]);

		if (roomRes.error) throw new Error(`Randevular yüklenemedi: ${roomRes.error.message}`);
		if (trainerRes.error) throw new Error(`Randevular yüklenemedi: ${trainerRes.error.message}`);

		const byId = new Map<number, OccupiedSlot>();
		for (const row of [...(roomRes.data ?? []), ...(trainerRes.data ?? [])]) {
			byId.set(row.id, row);
		}
		return [...byId.values()];
	}
}
