import type { SupabaseClientType } from '$lib/types/Supabase';
import type { SeriesAppointment, TransferScope } from '$lib/types/Transfer';
import type { LinkedLesson, WeeklySlot } from '$lib/types/Schedule';
import { compareSlots, recurringPattern } from '$lib/utils/slot-utils';
import { asAbsenceOutcome, asAttendance } from '$lib/utils/attendance-utils';
import { dbErrorMessage } from '$lib/server/db-errors';
import { PurchaseRepository } from '$lib/server/repositories/purchase-repository';
import { getGroupLessonCanonicalSlots } from '$lib/server/scheduling/extension';
import {
	formatDateForDB,
	getDayOfWeekFromDate,
	getWeekEnd,
	isAppointmentFuture
} from '$lib/utils/date-utils';

// The week board's appointments with the relations its blocks, side panel and warnings use
const WEEK_SELECT = `
	*,
	pe_purchases(
		id,
		reschedule_left,
		makeup_left,
		successor_id,
		pe_packages(id, name, package_type, weeks_duration, min_lessons_per_week, max_lessons_per_week, max_capacity, attendance_enabled)
	),
	pe_group_lessons(
		id,
		pe_packages(id, name, package_type, weeks_duration, min_lessons_per_week, max_lessons_per_week, max_capacity, attendance_enabled)
	),
	pe_rooms(id, name),
	pe_trainers(id, name),
	pe_appointment_trainees(
		id,
		session_number,
		total_sessions,
		purchase_id,
		attendance,
		absence_outcome,
		makeup_for_id,
		pe_trainees(id, name, notes),
		pe_purchases(successor_id, makeup_left, reschedule_left)
	)
` as const;

// A replacement lesson (shift or make-up) and the missed lesson it stands in for
const LINK_SELECT = 'id, makeup_for_id, pe_appointments(id, date, hour)' as const;

const SERIES_SELECT = `
	*,
	pe_rooms(id, name),
	pe_trainers(id, name),
	pe_purchases(id, reschedule_left, pe_packages(name, package_type)),
	pe_group_lessons(id, pe_packages(name, package_type, max_capacity)),
	pe_appointment_trainees(id, trainee_id, session_number, total_sessions, pe_trainees(id, name, phone))
` as const;

/**
 * Reads appointments for scheduling operations. `getSeries` is the one definition of
 * "the appointments an operation on this appointment covers", shared by moves, shifts,
 * transfers and their previews.
 */
export class AppointmentRepository {
	constructor(private supabase: SupabaseClientType) {}

	/**
	 * A week's appointments (Monday `weekStart` on), optionally one trainer's, chronological.
	 * Throws on a failed query: an empty board would read as a free week.
	 */
	// Return type inferred from WEEK_SELECT, so pages keep the exact row shape
	async getWeek(weekStart: Date, trainerId?: string) {
		let query = this.supabase
			.from('pe_appointments')
			.select(WEEK_SELECT)
			.gte('date', formatDateForDB(weekStart))
			.lte('date', formatDateForDB(getWeekEnd(weekStart)));
		if (trainerId) query = query.eq('trainer_id', trainerId);
		const { data, error } = await query.order('date').order('hour');
		if (error) throw error;

		// Replacement lessons and the missed lessons they stand in for, so the sheet can
		// name both sides ("27 Eki dersi yerine", "Telafi → 3 Kas")
		const enrollments = data.flatMap((a) => a.pe_appointment_trainees);
		const replacedIds = enrollments
			.filter((e) => e.absence_outcome === 'shifted' || e.absence_outcome === 'makeup')
			.map((e) => e.id);
		const originIds = enrollments.flatMap((e) =>
			e.makeup_for_id === null ? [] : [e.makeup_for_id]
		);
		const [replacements, origins] = await Promise.all([
			this.linkedLessons('makeup_for_id', replacedIds),
			this.linkedLessons('id', originIds)
		]);

		return data.map((a) => ({
			...a,
			pe_appointment_trainees: a.pe_appointment_trainees.map((e) => ({
				...e,
				attendance: asAttendance(e.attendance),
				absence_outcome: asAbsenceOutcome(e.absence_outcome),
				origin: e.makeup_for_id === null ? null : (origins.get(e.makeup_for_id) ?? null),
				replacement: replacements.get(e.id) ?? null
			}))
		}));
	}

	// Linked lessons by the given key: an origin's replacement (`makeup_for_id` = origin id)
	// or a replacement's origin (`id`). Rows RLS hides (another trainer's lesson) are absent.
	private async linkedLessons(
		key: 'id' | 'makeup_for_id',
		ids: number[]
	): Promise<Map<number, LinkedLesson>> {
		const links = new Map<number, LinkedLesson>();
		if (ids.length === 0) return links;
		const { data, error } = await this.supabase
			.from('pe_appointment_trainees')
			.select(LINK_SELECT)
			.in(key, [...new Set(ids)]);
		if (error) throw new Error(dbErrorMessage(error, 'Telafi dersleri yüklenemedi.'));
		for (const row of data) {
			const lookup = key === 'id' ? row.id : row.makeup_for_id;
			if (lookup === null || !row.pe_appointments) continue;
			links.set(lookup, {
				enrollmentId: row.id,
				appointmentId: row.pe_appointments.id,
				date: row.pe_appointments.date,
				hour: row.pe_appointments.hour
			});
		}
		return links;
	}

	async getById(appointmentId: number): Promise<SeriesAppointment | null> {
		const { data } = await this.supabase
			.from('pe_appointments')
			.select(SERIES_SELECT)
			.eq('id', appointmentId)
			.maybeSingle();
		return data;
	}

	/**
	 * The appointments an operation on `appointmentId` covers, chronological:
	 * - private lesson: its purchase chain, extensions included;
	 * - group lesson: the lesson's canonical slots (one-off reschedule destinations are
	 *   left out, they don't belong to the recurring series);
	 * - with `traineeId`: that trainee's own enrolled appointments across their purchase
	 *   chain, each kept only if it is on its own group's canonical slots.
	 * Scope `single` is the appointment itself, `from_selected` starts at it, and
	 * `all_from_now` covers every upcoming one.
	 */
	async getSeries(
		appointmentId: number,
		scope: TransferScope,
		traineeId: string | null = null
	): Promise<SeriesAppointment[]> {
		const anchor = await this.getById(appointmentId);
		if (!anchor) return [];
		if (scope === 'single') return [anchor];

		let rows: SeriesAppointment[];
		if (traineeId) {
			rows = await this.getTraineeAppointments(anchor.id, traineeId);
		} else if (anchor.purchase_id) {
			const chain = await new PurchaseRepository(this.supabase).getSuccessorChain(
				anchor.purchase_id
			);
			const { data } = await this.supabase
				.from('pe_appointments')
				.select(SERIES_SELECT)
				.in('purchase_id', chain)
				.gte('date', scope === 'from_selected' ? anchor.date : todayDate());
			rows = data ?? [];
		} else if (anchor.group_lesson_id) {
			const { data } = await this.supabase
				.from('pe_appointments')
				.select(SERIES_SELECT)
				.eq('group_lesson_id', anchor.group_lesson_id)
				.gte('date', scope === 'from_selected' ? anchor.date : todayDate());
			rows = data ?? [];
		} else {
			return [anchor];
		}

		const inScope = rows.filter((row) =>
			scope === 'from_selected'
				? compareSlots(row, anchor) >= 0
				: isAppointmentFuture(row.date, row.hour)
		);
		return (await this.keepCanonicalGroupSlots(inScope)).sort(compareSlots);
	}

	/**
	 * The weekly program the series of `appointmentId` follows from it on (Taşı → Haftalık
	 * program): a group lesson's stored pattern, otherwise the one its lessons form. Empty
	 * when there is none.
	 */
	async getSeriesPattern(appointmentId: number): Promise<WeeklySlot[]> {
		const anchor = await this.getById(appointmentId);
		if (!anchor) return [];
		if (anchor.group_lesson_id) {
			return (await getGroupLessonCanonicalSlots(this.supabase, anchor.group_lesson_id)).slots;
		}
		return recurringPattern(await this.getSeries(appointmentId, 'from_selected'));
	}

	/** A group lesson's upcoming sessions from `fromDate` on, chronological, one-offs included. */
	async getGroupLessonSessions(
		groupLessonId: string,
		fromDate: string
	): Promise<SeriesAppointment[]> {
		const { data } = await this.supabase
			.from('pe_appointments')
			.select(SERIES_SELECT)
			.eq('group_lesson_id', groupLessonId)
			.gte('date', fromDate);
		return (data ?? []).filter((row) => isAppointmentFuture(row.date, row.hour)).sort(compareSlots);
	}

	private async getTraineeAppointments(
		anchorId: number,
		traineeId: string
	): Promise<SeriesAppointment[]> {
		const { data: record } = await this.supabase
			.from('pe_appointment_trainees')
			.select('purchase_id')
			.eq('appointment_id', anchorId)
			.eq('trainee_id', traineeId)
			.maybeSingle();
		if (!record) return [];

		// Replacement lessons (shifts, make-ups) sit off the series and stay where they are
		const chain = await new PurchaseRepository(this.supabase).getSuccessorChain(record.purchase_id);
		const { data: enrollments } = await this.supabase
			.from('pe_appointment_trainees')
			.select('appointment_id')
			.eq('trainee_id', traineeId)
			.in('purchase_id', chain)
			.is('makeup_for_id', null);
		const ids = (enrollments ?? []).flatMap((e) =>
			e.appointment_id === null ? [] : [e.appointment_id]
		);
		if (ids.length === 0) return [];

		const { data } = await this.supabase
			.from('pe_appointments')
			.select(SERIES_SELECT)
			.in('id', ids);
		return data ?? [];
	}

	// Each group appointment is checked against its own lesson's pattern: a trainee's chain
	// can span several group lessons.
	private async keepCanonicalGroupSlots(rows: SeriesAppointment[]): Promise<SeriesAppointment[]> {
		const slotKeysByLesson = new Map<string, Set<string>>();
		for (const lessonId of new Set(
			rows.flatMap((r) => (r.group_lesson_id ? [r.group_lesson_id] : []))
		)) {
			slotKeysByLesson.set(
				lessonId,
				(await getGroupLessonCanonicalSlots(this.supabase, lessonId)).slotKeys
			);
		}
		return rows.filter((row) => {
			const slotKeys = row.group_lesson_id ? slotKeysByLesson.get(row.group_lesson_id) : undefined;
			return (
				!slotKeys ||
				slotKeys.size === 0 ||
				slotKeys.has(`${getDayOfWeekFromDate(row.date)}-${row.hour}`)
			);
		});
	}
}

function todayDate(): string {
	return formatDateForDB(new Date());
}
