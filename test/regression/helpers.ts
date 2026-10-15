import { createClient } from '@supabase/supabase-js';
import { isActionFailure, isHttpError, type RequestEvent } from '@sveltejs/kit';
import { expect, inject } from 'vitest';
import type { RouteId as AppRouteId } from '$app/types';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import type { Database } from '$lib/types/database.types';
import type { ActionForm, ActionOutcome, BookedLesson, WeekdayHour } from '$lib/types/Regression';
import type { SupabaseClientType } from '$lib/types/Supabase';
import { pagedRows } from '$lib/server/paging';
import { PurchaseRepository } from '$lib/server/repositories/purchase-repository';
import { addDays, formatDateForDB, parseLocalDate } from '$lib/utils/date-utils';
import { compareSlots } from '$lib/utils/slot-utils';

const demo = inject('demo');

/** The seeded fixtures: ids by key (see supabase/migrations/*_pe_demo_reset.sql). */
export const fx = demo.manifest;

/** The Demo admin's client: RLS-scoped to the Demo studio, like the app's own. */
export const supabase: SupabaseClientType = createClient<Database>(
	PUBLIC_SUPABASE_URL,
	PUBLIC_SUPABASE_ANON_KEY,
	{
		global: { headers: { Authorization: `Bearer ${demo.accessToken}` } },
		auth: { persistSession: false, autoRefreshToken: false }
	}
);

const locals: App.Locals = {
	supabase,
	safeGetSession: async () => ({ session: null, user: demo.user }),
	session: null,
	user: demo.user,
	admin: undefined,
	userRole: 'admin',
	organizationId: fx.organizationId,
	organizationName: 'Demo'
};

// ---- Dates (all relative to the seeded week) ----

/** The date `days` after `date`. */
export function plusDays(date: string, days: number): string {
	return formatDateForDB(addDays(parseLocalDate(date), days));
}

/** ISO weekday `day` (1 = Monday … 7 = Sunday) of week `week` (0 = this week). */
export function dayOf(week: number, day: number): string {
	return plusDays(fx.week0, week * 7 + day - 1);
}

/** A slot as "2026-10-20@18", for compact comparisons. */
export function at(slot: { date: string; hour: number }): string {
	return `${slot.date}@${slot.hour}`;
}

/**
 * The first `count` slots of a weekly pattern from week `fromWeek` on, as `at()` strings:
 * weekly(1, [[2, 18], [6, 10]], 4) is Tuesday 18:00 and Saturday 10:00 of weeks 1 and 2.
 */
export function weekly(fromWeek: number, slots: WeekdayHour[], count: number): string[] {
	const ordered = [...slots].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const result: string[] = [];
	for (let week = fromWeek; result.length < count; week++) {
		for (const [day, hour] of ordered) {
			if (result.length < count) result.push(at({ date: dayOf(week, day), hour }));
		}
	}
	return result;
}

// ---- Calling form actions ----

/** The params of a route without any. */
export const noParams = {};

/** The reason the Taşı / Randevu değiştir forms post for a studio-caused change. */
export const studioReason = { source: 'studio', cause: 'Regresyon testi' };

/**
 * Posts `form` to a route's form action the way the browser does, as the Demo admin, and
 * reports the result: a `fail()` or a thrown `error()` is `ok: false` with its message.
 */
export async function runAction<
	Params extends Partial<Record<string, string>>,
	RouteId extends AppRouteId | null,
	Output
>(
	action: (event: RequestEvent<Params, RouteId>) => Output | Promise<Output>,
	form: ActionForm,
	params: Params
): Promise<ActionOutcome<Exclude<Output, void | undefined>>> {
	const body = new FormData();
	for (const [key, value] of Object.entries(form)) body.append(key, String(value));
	const request = new Request('http://localhost/regression', { method: 'POST', body });
	const event = { request, params, locals, url: new URL(request.url) } as RequestEvent<
		Params,
		RouteId
	>;

	try {
		const result = await action(event);
		if (isActionFailure(result)) {
			const data = result.data as { message?: string } | undefined;
			return { ok: false, status: result.status, message: data?.message ?? '' };
		}
		const data = (result ?? {}) as Exclude<Output, void | undefined>;
		const message = (result as { message?: string } | undefined)?.message;
		return { ok: true, status: 200, message: message ?? '', data };
	} catch (thrown) {
		if (isHttpError(thrown)) {
			return { ok: false, status: thrown.status, message: thrown.body.message };
		}
		throw thrown;
	}
}

/** The data of a successful action; fails the test with the action's message otherwise. */
export function expectOk<Data>(outcome: ActionOutcome<Data>): Data {
	if (!outcome.ok) throw new Error(`Action failed (${outcome.status}): ${outcome.message}`);
	return outcome.data;
}

// ---- Reading the studio ----

/** The lessons booked under the given purchases (one trainee's when given), by date. */
export async function lessonsOf(purchaseIds: string | string[], traineeId?: string) {
	let query = supabase
		.from('pe_appointment_trainees')
		.select(
			'trainee_id, purchase_id, session_number, total_sessions, pe_appointments!inner(id, date, hour, room_id, trainer_id, group_lesson_id)'
		)
		.in('purchase_id', typeof purchaseIds === 'string' ? [purchaseIds] : purchaseIds);
	if (traineeId) query = query.eq('trainee_id', traineeId);
	const { data, error } = await query;
	if (error) throw new Error(error.message);
	return (data ?? [])
		.map((row): BookedLesson => ({
			appointmentId: row.pe_appointments.id,
			date: row.pe_appointments.date,
			hour: row.pe_appointments.hour,
			roomId: row.pe_appointments.room_id,
			trainerId: row.pe_appointments.trainer_id,
			groupLessonId: row.pe_appointments.group_lesson_id,
			traineeId: row.trainee_id,
			purchaseId: row.purchase_id,
			sessionNumber: row.session_number,
			totalSessions: row.total_sessions
		}))
		.sort(compareSlots);
}

/** A seeded kayıt's lessons (its first trainee's when shared). */
export function kayitLessons(key: string, traineeKey = key) {
	return lessonsOf(fx.purchases[key], fx.trainees[traineeKey]);
}

/** The purchases of a kayıt chain, from `purchaseId` on. */
export function chainOf(purchaseId: string): Promise<string[]> {
	return new PurchaseRepository(supabase).getSuccessorChain(purchaseId);
}

/** A trainee's kayıtlar: each one's purchase chain, first purchase first. */
export async function kayitlarOf(traineeId: string): Promise<string[][]> {
	const { data: teams } = await supabase.from('pe_teams').select('id').eq('trainee_id', traineeId);
	const { data, error } = await supabase
		.from('pe_purchases')
		.select('id, successor_id')
		.in(
			'team_id',
			(teams ?? []).map((t) => t.id)
		);
	if (error) throw new Error(error.message);
	const successors = new Set(data.map((p) => p.successor_id));
	const firsts = data.filter((p) => !successors.has(p.id));
	return Promise.all(firsts.map((p) => chainOf(p.id)));
}

/** The appointments on a date, with their trainee count. */
export async function appointmentsOn(date: string) {
	const { data, error } = await supabase
		.from('pe_appointments')
		.select('id, hour, purchase_id, group_lesson_id, pe_appointment_trainees(trainee_id)')
		.eq('date', date)
		.order('hour');
	if (error) throw new Error(error.message);
	return (data ?? []).map((a) => ({
		id: a.id,
		hour: a.hour,
		purchaseId: a.purchase_id,
		groupLessonId: a.group_lesson_id,
		traineeIds: a.pe_appointment_trainees.map((t) => t.trainee_id)
	}));
}

/** The session of a group lesson at a slot, or null. */
export async function groupSession(groupLessonId: string, date: string, hour: number) {
	const { data } = await supabase
		.from('pe_appointments')
		.select('id, room_id, trainer_id, pe_appointment_trainees(trainee_id)')
		.eq('group_lesson_id', groupLessonId)
		.eq('date', date)
		.eq('hour', hour)
		.maybeSingle();
	return data;
}

/** Every appointment of the studio, with its trainees, one line each. */
async function studioSnapshot(): Promise<string[]> {
	const rows = await pagedRows((from, to) =>
		supabase
			.from('pe_appointments')
			.select('id, date, hour, room_id, trainer_id, pe_appointment_trainees(trainee_id)')
			.order('id')
			.range(from, to)
	);
	return rows.map(
		(a) =>
			`${a.id} ${a.date}@${a.hour} ${a.room_id} ${a.trainer_id} ` +
			a.pe_appointment_trainees
				.map((t) => t.trainee_id)
				.sort()
				.join(',')
	);
}

/** Runs a blocked operation and asserts it left every appointment of the studio as it was. */
export async function expectNoChange(operation: () => Promise<void>): Promise<void> {
	const before = await studioSnapshot();
	await operation();
	expect(await studioSnapshot()).toEqual(before);
}
