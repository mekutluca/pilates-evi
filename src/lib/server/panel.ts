import type { SupabaseClientType } from '$lib/types/Supabase';
import type {
	EndingKayit,
	NewKayit,
	PanelLesson,
	StudioPanel,
	TrainerPanel
} from '$lib/types/Dashboard';
import {
	addDays,
	formatDateForDB,
	getDayOfWeekFromDate,
	getWeekStart,
	isAppointmentFuture
} from '$lib/utils/date-utils';
import { renewalWindowEnd } from '$lib/utils/appointment-utils';
import { sortTimeSlots, weeklySlotKey } from '$lib/utils/slot-utils';
import { dbErrorMessage } from '$lib/server/db-errors';

const ROW_PAGE = 1000;
// "Paketi bitmek üzere": the last lesson is within the renewal window ahead…
// …or was at most this many days ago, without a renewal
const ENDED_BEHIND_DAYS = 7;

// The API caps a response at 1000 rows; a cut-off list would make kayıtlar look like
// they are ending, so these reads are paged
async function pagedRows<T>(
	fetchPage: (
		from: number,
		to: number
	) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
	const rows: T[] = [];
	for (let from = 0; ; from += ROW_PAGE) {
		const { data, error } = await fetchPage(from, from + ROW_PAGE - 1);
		if (error) throw new Error(error.message);
		rows.push(...(data ?? []));
		if ((data ?? []).length < ROW_PAGE) return rows;
	}
}

// This week's lessons, optionally one trainer's, chronological, and how many distinct
// trainees they have
async function weekLessons(
	supabase: SupabaseClientType,
	trainerId?: string
): Promise<{ lessons: PanelLesson[]; traineeCount: number }> {
	const weekStart = getWeekStart(new Date());
	let query = supabase
		.from('pe_appointments')
		.select(
			`id, date, hour, room_id, group_lesson_id, pe_rooms(name), pe_trainers(name),
				pe_purchases(pe_packages(name)), pe_group_lessons(pe_packages(name)),
				pe_appointment_trainees(trainee_id, pe_trainees(name))`
		)
		.gte('date', formatDateForDB(weekStart))
		.lt('date', formatDateForDB(addDays(weekStart, 7)));
	if (trainerId) query = query.eq('trainer_id', trainerId);

	const { data, error } = await query.order('date').order('hour');
	if (error) throw new Error(dbErrorMessage(error, 'Randevular yüklenemedi. Tekrar deneyin.'));

	const rows = data ?? [];
	const traineeCount = new Set(
		rows.flatMap((a) => a.pe_appointment_trainees.map((e) => e.trainee_id))
	).size;
	const lessons = rows.map((a) => ({
		appointmentId: a.id,
		date: a.date,
		hour: a.hour,
		packageName: a.pe_purchases?.pe_packages.name ?? a.pe_group_lessons?.pe_packages.name ?? '',
		roomId: a.room_id,
		roomName: a.pe_rooms.name ?? '',
		trainerName: a.pe_trainers.name ?? '',
		traineeNames: a.pe_appointment_trainees.map((e) => e.pe_trainees.name),
		isGroup: a.group_lesson_id !== null
	}));
	return { lessons, traineeCount };
}

// Kayıtlar running out: chain-end purchases whose last lesson falls in the window
async function endingKayitlar(supabase: SupabaseClientType): Promise<EndingKayit[]> {
	const today = new Date();
	const windowStart = formatDateForDB(addDays(today, -ENDED_BEHIND_DAYS));
	const windowEnd = renewalWindowEnd();

	const inWindow = await pagedRows((from, to) =>
		supabase
			.from('pe_appointment_trainees')
			.select('trainee_id, purchase_id, pe_trainees(name), pe_appointments!inner(date, hour)')
			.gte('pe_appointments.date', windowStart)
			.lte('pe_appointments.date', windowEnd)
			.order('id')
			.range(from, to)
	);
	const candidateIds = [...new Set(inWindow.map((r) => r.purchase_id))];
	if (candidateIds.length === 0) return [];

	// Renewed kayıtlar continue in their successor; lessons after the window mean the
	// kayıt isn't ending yet
	const [{ data: open, error: openError }, later] = await Promise.all([
		supabase
			.from('pe_purchases')
			.select('id, lesson_count, pe_packages(name)')
			.in('id', candidateIds)
			.is('successor_id', null),
		pagedRows((from, to) =>
			supabase
				.from('pe_appointment_trainees')
				.select('purchase_id, pe_appointments!inner(date)')
				.in('purchase_id', candidateIds)
				.gt('pe_appointments.date', windowEnd)
				.order('id')
				.range(from, to)
		)
	]);
	if (openError) throw new Error(openError.message);
	const continuing = new Set(later.map((r) => r.purchase_id));
	const ending = new Map(
		(open ?? []).filter((p) => !continuing.has(p.id)).map((p) => [p.id, p] as const)
	);

	const byKayit = new Map<string, EndingKayit>();
	for (const row of inWindow) {
		const purchase = ending.get(row.purchase_id);
		if (!purchase) continue;
		const key = `${row.trainee_id}|${row.purchase_id}`;
		const entry = byKayit.get(key) ?? {
			traineeId: row.trainee_id,
			traineeName: row.pe_trainees.name,
			purchaseId: row.purchase_id,
			packageName: purchase.pe_packages.name,
			total: purchase.lesson_count,
			remaining: 0,
			lastDate: row.pe_appointments.date,
			slots: []
		};
		const { date, hour } = row.pe_appointments;
		if (isAppointmentFuture(date, hour)) entry.remaining++;
		if (date > entry.lastDate) entry.lastDate = date;
		const slot = { day: getDayOfWeekFromDate(date), hour };
		if (!entry.slots.some((s) => weeklySlotKey(s) === weeklySlotKey(slot))) {
			entry.slots = sortTimeSlots([...entry.slots, slot]);
		}
		byKayit.set(key, entry);
	}
	return [...byKayit.values()].sort(
		(a, b) =>
			a.lastDate.localeCompare(b.lastDate) || a.traineeName.localeCompare(b.traineeName, 'tr')
	);
}

// Purchases opened this week: new kayıtlar listed, renewals (successors) counted
async function weekKayitlar(
	supabase: SupabaseClientType
): Promise<{ newKayitlar: NewKayit[]; renewalCount: number }> {
	const weekStart = getWeekStart(new Date());
	const { data: purchases, error } = await supabase
		.from('pe_purchases')
		.select('id, created_at, team_id, pe_packages(name, package_type)')
		.gte('created_at', weekStart.toISOString())
		.lt('created_at', addDays(weekStart, 7).toISOString())
		.order('created_at', { ascending: false });
	if (error) throw new Error(dbErrorMessage(error, 'Kayıtlar yüklenemedi. Tekrar deneyin.'));
	if (!purchases || purchases.length === 0) return { newKayitlar: [], renewalCount: 0 };

	const [{ data: predecessors }, { data: teams }] = await Promise.all([
		supabase
			.from('pe_purchases')
			.select('successor_id')
			.in(
				'successor_id',
				purchases.map((p) => p.id)
			),
		supabase
			.from('pe_teams')
			.select('id, pe_trainees(id, name)')
			.in('id', [...new Set(purchases.map((p) => p.team_id))])
	]);
	const renewals = new Set((predecessors ?? []).map((p) => p.successor_id));
	const teamMembers = new Map<string, Array<{ id: string; name: string }>>();
	for (const member of teams ?? []) {
		teamMembers.set(member.id, [...(teamMembers.get(member.id) ?? []), member.pe_trainees]);
	}

	return {
		renewalCount: renewals.size,
		newKayitlar: purchases
			.filter((p) => !renewals.has(p.id))
			.map((p) => ({
				purchaseId: p.id,
				createdAt: p.created_at,
				packageName: p.pe_packages.name,
				isGroup: p.pe_packages.package_type === 'group',
				trainees: teamMembers.get(p.team_id) ?? []
			}))
	};
}

/** The coordinator/admin panel: today, kayıtlar ending soon, this week's new kayıtlar. */
export async function loadStudioPanel(supabase: SupabaseClientType): Promise<StudioPanel> {
	const today = formatDateForDB(new Date());
	const [week, ending, kayitlar] = await Promise.all([
		weekLessons(supabase),
		endingKayitlar(supabase),
		weekKayitlar(supabase)
	]);
	return {
		kind: 'studio',
		today: week.lessons.filter((l) => l.date === today),
		weekLessonCount: week.lessons.length,
		weekTraineeCount: week.traineeCount,
		ending,
		...kayitlar
	};
}

/** A trainer's panel: their lessons today and this week. */
export async function loadTrainerPanel(
	supabase: SupabaseClientType,
	trainerId: string
): Promise<TrainerPanel> {
	const today = formatDateForDB(new Date());
	const { lessons, traineeCount } = await weekLessons(supabase, trainerId);
	return {
		kind: 'trainer',
		today: lessons.filter((l) => l.date === today),
		week: lessons,
		weekTraineeCount: traineeCount
	};
}
