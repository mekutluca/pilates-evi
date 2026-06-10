import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { SlotRef, SlotConflict, OccupiedSlot } from '$lib/types/Conflict';

/**
 * Single source of truth for room/trainer booking conflicts.
 * A slot conflicts when the room OR the trainer already has an appointment
 * at the same date and hour — the two resources are checked independently.
 */
export class ConflictService {
	constructor(private supabase: SupabaseClient<Database>) {}

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
