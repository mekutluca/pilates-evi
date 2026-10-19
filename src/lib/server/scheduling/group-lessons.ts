import type { SupabaseClientType } from '$lib/types/Supabase';
import type { AvailableGroupTimeslot, SelectedGroupTimeslot } from '$lib/types';
import type { AppointmentSlotRef, WeeklySlot } from '$lib/types/Schedule';
import type {
	GroupLessonDetail,
	GroupLessonMember,
	GroupLessonMoveInput,
	GroupLessonPlan,
	GroupLessonSummary,
	NewGroupLessonInput
} from '$lib/types/GroupLesson';
import type { MovedAppointment } from '$lib/types/Transfer';
import {
	groupLessonSlots,
	parseGroupLessonTimeslots,
	toGroupLessonTimeslots
} from '$lib/server/scheduling/extension';
import { AppointmentRepository } from '$lib/server/repositories/appointment-repository';
import { ConflictService } from '$lib/server/services/conflict-service';
import {
	addDays,
	formatDateForDB,
	formatSlotLabel,
	getDayOfWeekFromDate,
	getTomorrow,
	isAppointmentFuture,
	isPastDate,
	isPlannedFromStart,
	parseLocalDate
} from '$lib/utils/date-utils';
import {
	buildAppointmentSlotsFromStart,
	compareSlots,
	getStartingAppointmentCandidates,
	resolveSlotChanges,
	slotChangeTarget,
	weeklySlotKey
} from '$lib/utils/slot-utils';
import { dbErrorMessage } from '$lib/server/db-errors';
import { pagedRows } from '$lib/server/paging';

// New group lessons get sessions this many weeks ahead; the weekly top-up cron keeps the
// horizon there
const GROUP_LESSON_HORIZON_WEEKS = 26;
const DAY_MS = 24 * 60 * 60 * 1000;

function dayAfter(date: string): string {
	return formatDateForDB(addDays(parseLocalDate(date), 1));
}

/**
 * Group lessons with their pattern, resources and how many trainees attend: every
 * running one, or the one with `id` (running or ended). Ended lessons are listed with
 * `includeEnded`.
 */
export async function listGroupLessons(
	supabase: SupabaseClientType,
	options: { id?: string; includeEnded?: boolean } = {}
): Promise<GroupLessonSummary[]> {
	// Sessions are embedded with an inner join on trainees, so only sessions someone
	// attends come back; lessons without any still do, with an empty array
	let query = supabase.from('pe_group_lessons').select(
		`id, package_id, room_id, trainer_id, start_date, end_date, timeslots,
			pe_packages(name, max_capacity), pe_rooms(name), pe_trainers(name),
			pe_appointments(date, pe_appointment_trainees!inner(trainee_id))`
	);
	if (options.id) query = query.eq('id', options.id);
	else if (!options.includeEnded) query = query.is('end_date', null);

	const { data, error } = await query;
	if (error) throw new Error(dbErrorMessage(error, 'Grup dersleri yüklenemedi. Tekrar deneyin.'));

	const today = formatDateForDB(new Date());
	const tomorrow = formatDateForDB(getTomorrow());

	return (data ?? [])
		.map((lesson) => {
			let lastEnrolledDate: string | null = null;
			const trainees = new Set<string>();
			for (const session of lesson.pe_appointments) {
				if (!lastEnrolledDate || session.date > lastEnrolledDate) lastEnrolledDate = session.date;
				if (session.date >= today) {
					for (const e of session.pe_appointment_trainees) trainees.add(e.trainee_id);
				}
			}
			const afterLast = lastEnrolledDate ? dayAfter(lastEnrolledDate) : tomorrow;
			return {
				id: lesson.id,
				packageId: lesson.package_id,
				packageName: lesson.pe_packages.name,
				roomId: lesson.room_id,
				roomName: lesson.pe_rooms.name ?? '',
				trainerId: lesson.trainer_id,
				trainerName: lesson.pe_trainers.name ?? '',
				startDate: lesson.start_date,
				endDate: lesson.end_date,
				slots: groupLessonSlots(lesson.timeslots),
				maxCapacity: lesson.pe_packages.max_capacity,
				traineeCount: trainees.size,
				lastEnrolledDate,
				minEndDate: afterLast > tomorrow ? afterLast : tomorrow
			};
		})
		.sort((a, b) => a.packageName.localeCompare(b.packageName, 'tr'));
}

/** One group lesson with its trainees and upcoming sessions; null when it doesn't exist. */
export async function getGroupLesson(
	supabase: SupabaseClientType,
	id: string
): Promise<GroupLessonDetail | null> {
	const [summary] = await listGroupLessons(supabase, { id });
	if (!summary) return null;

	const { data, error } = await supabase
		.from('pe_appointments')
		.select(
			`id, date, hour, room_id, pe_rooms(name), pe_trainers(name),
				pe_appointment_trainees(trainee_id, purchase_id, pe_trainees(name))`
		)
		.eq('group_lesson_id', id)
		.gte('date', formatDateForDB(new Date()))
		.order('date')
		.order('hour');
	if (error)
		throw new Error(dbErrorMessage(error, 'Grup dersi randevuları yüklenemedi. Tekrar deneyin.'));

	const patternKeys = new Set(summary.slots.map(weeklySlotKey));
	const upcoming = (data ?? []).filter((a) => isAppointmentFuture(a.date, a.hour));

	const members = new Map<string, GroupLessonMember>();
	for (const session of upcoming) {
		for (const e of session.pe_appointment_trainees) {
			const member = members.get(e.trainee_id);
			// Sessions are chronological: the latest one names the kayıt to renew
			members.set(e.trainee_id, {
				traineeId: e.trainee_id,
				name: e.pe_trainees.name,
				purchaseId: e.purchase_id,
				upcomingCount: (member?.upcomingCount ?? 0) + 1,
				lastDate: session.date
			});
		}
	}

	return {
		...summary,
		members: [...members.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr')),
		sessions: upcoming.map((a) => ({
			appointmentId: a.id,
			date: a.date,
			hour: a.hour,
			roomId: a.room_id,
			roomName: a.pe_rooms.name ?? '',
			trainerName: a.pe_trainers.name ?? '',
			traineeNames: a.pe_appointment_trainees.map((e) => e.pe_trainees.name),
			offPattern: !patternKeys.has(
				weeklySlotKey({ day: getDayOfWeekFromDate(a.date), hour: a.hour })
			)
		}))
	};
}

/**
 * Plans opening a group lesson: its sessions from the start date until 26 weeks from
 * today and the slots where the room or trainer is already taken. A start in the past
 * back-dates the lesson (its passed sessions are created too, for trainees to join).
 * Nothing is written; returns an error message when the input itself is invalid.
 */
export async function planGroupLesson(
	supabase: SupabaseClientType,
	input: NewGroupLessonInput
): Promise<GroupLessonPlan | string> {
	if (input.slots.length === 0) return 'En az bir ders saati seçin';
	if (new Set(input.slots.map(weeklySlotKey)).size !== input.slots.length) {
		return 'Aynı gün ve saat iki kez seçilmiş';
	}

	const { data: pkg } = await supabase
		.from('pe_packages')
		.select('package_type, is_active')
		.eq('id', input.packageId)
		.maybeSingle();
	if (!pkg) return 'Paket bulunamadı';
	if (pkg.package_type !== 'group') return 'Grup dersi yalnızca grup paketiyle açılabilir';
	if (pkg.is_active === false) return 'Paket arşivde';

	// Starting today, a slot earlier today has passed; the lesson then starts at the next one
	const first = getStartingAppointmentCandidates(
		input.slots,
		parseLocalDate(input.startDate),
		input.slots.length + 1
	).find((c) => isPlannedFromStart(input.startDate, c.date, c.hour));
	if (!first) return 'Başlangıç tarihi bulunamadı';

	// The weeks already behind a back-dated start come on top of the horizon (the top-up
	// cron only fills from today on)
	const firstDate = parseLocalDate(first.date);
	const elapsedDays = Math.round(
		(parseLocalDate(formatDateForDB(new Date())).getTime() - firstDate.getTime()) / DAY_MS
	);
	const weeks = GROUP_LESSON_HORIZON_WEEKS + Math.max(0, Math.ceil(elapsedDays / 7));

	const sessions = buildAppointmentSlotsFromStart(
		firstDate,
		first.hour,
		input.slots,
		weeks * input.slots.length
	);
	const conflicts = await new ConflictService(supabase).findSlotConflicts({
		roomId: input.roomId,
		trainerId: input.trainerId,
		slots: sessions
	});

	return {
		sessions,
		conflicts,
		payload: {
			groupLesson: {
				package_id: input.packageId,
				room_id: input.roomId,
				trainer_id: input.trainerId,
				start_date: first.date,
				appointments_created_until: formatDateForDB(addDays(firstDate, weeks * 7)),
				timeslots: toGroupLessonTimeslots(input.slots)
			},
			purchases: [],
			appointments: sessions.map((slot, i) => ({
				key: String(i),
				room_id: input.roomId,
				trainer_id: input.trainerId,
				date: slot.date,
				hour: slot.hour,
				in_group: true
			})),
			enrollments: []
		}
	};
}

/**
 * Plans a Taşı of a whole group lesson from `fromDate` on: each session on a changed
 * weekly slot moves to the new day/hour of the same week; with a new room or trainer
 * every session moves. Returns the moves and the lesson's new pattern, or an error.
 */
export async function planGroupLessonMove(
	supabase: SupabaseClientType,
	input: GroupLessonMoveInput
): Promise<{ moved: MovedAppointment[]; slots: WeeklySlot[] } | string> {
	const [lesson] = await listGroupLessons(supabase, { id: input.groupLessonId });
	if (!lesson) return 'Grup dersi bulunamadı';
	if (lesson.endDate) return 'Sona ermiş grup dersi taşınamaz';
	if (isPastDate(input.fromDate)) return 'Başlangıç tarihi geçmişte olamaz';

	const resolved = resolveSlotChanges(lesson.slots, input.slotChanges);
	if (typeof resolved === 'string') return resolved;
	const { changes, slots } = resolved;
	const resourcesChange =
		(input.roomId !== undefined && input.roomId !== lesson.roomId) ||
		(input.trainerId !== undefined && input.trainerId !== lesson.trainerId);
	if (changes.size === 0 && !resourcesChange) return 'Değişiklik yok';

	const sessions = await new AppointmentRepository(supabase).getGroupLessonSessions(
		lesson.id,
		input.fromDate
	);
	const moved: MovedAppointment[] = [];
	for (const appointment of sessions) {
		const target = slotChangeTarget(appointment, changes);
		if (!target && !resourcesChange) continue;
		const { date: newDate, hour: newHour } = target ?? appointment;
		if (!isAppointmentFuture(newDate, newHour)) {
			return `${formatSlotLabel(newDate, newHour)} geçmişte kalıyor, başlangıç tarihini ileri alın`;
		}
		moved.push({ appointment, newDate, newHour });
	}
	if (moved.length === 0) return 'Bu tarihten sonra taşınacak randevu yok';
	return { moved, slots };
}

/**
 * Every weekly time slot of a package's running group lessons, with how many trainees
 * attend its next session (what someone joining would share it with).
 */
export async function listGroupTimeslots(
	supabase: SupabaseClientType,
	packageId: string
): Promise<AvailableGroupTimeslot[]> {
	const { data: lessons, error } = await supabase
		.from('pe_group_lessons')
		.select(
			'id, room_id, trainer_id, timeslots, pe_packages(max_capacity), pe_rooms(name), pe_trainers(name)'
		)
		.eq('package_id', packageId)
		.is('end_date', null);
	// Failures throw: an empty list would read as "no group lesson running"
	if (error) throw new Error(dbErrorMessage(error, 'Grup dersleri yüklenemedi. Tekrar deneyin.'));
	if (!lessons || lessons.length === 0) return [];

	const { data: upcoming, error: upcomingError } = await supabase
		.from('pe_appointments')
		.select('id, date, hour, group_lesson_id, pe_appointment_trainees(trainee_id)')
		.in(
			'group_lesson_id',
			lessons.map((l) => l.id)
		)
		.gte('date', formatDateForDB(new Date()))
		.order('date')
		.order('hour');
	if (upcomingError) {
		throw new Error(dbErrorMessage(upcomingError, 'Grup dersleri yüklenemedi. Tekrar deneyin.'));
	}
	const future = (upcoming ?? []).filter((a) => isAppointmentFuture(a.date, a.hour));

	return lessons.flatMap((lesson) =>
		parseGroupLessonTimeslots(lesson.timeslots).flatMap((timeslot) =>
			timeslot.hours.map((hour) => {
				// Capacity of the next session on exactly this (day, hour) of this lesson
				const next = future.find(
					(a) =>
						a.group_lesson_id === lesson.id &&
						a.hour === hour &&
						getDayOfWeekFromDate(a.date) === timeslot.day
				);
				return {
					group_lesson_id: lesson.id,
					room_id: lesson.room_id,
					room_name: lesson.pe_rooms.name ?? '',
					trainer_id: lesson.trainer_id,
					trainer_name: lesson.pe_trainers.name ?? '',
					day: timeslot.day,
					hour,
					max_capacity: lesson.pe_packages.max_capacity,
					current_capacity: new Set(next?.pe_appointment_trainees.map((t) => t.trainee_id)).size
				};
			})
		)
	);
}

/**
 * The first `totalSessions` group sessions on the selected (lesson, day, hour) slots from
 * `fromDate` on, chronological; a `fromDate` in the past includes the passed ones (see
 * `isPlannedFromStart`). Cancelled occurrences are simply skipped; the next matching
 * sessions fill in.
 */
export async function collectGroupSessions(
	supabase: SupabaseClientType,
	selected: SelectedGroupTimeslot[],
	fromDate: string,
	totalSessions: number
): Promise<AppointmentSlotRef[]> {
	const lessonIds = [...new Set(selected.map((t) => t.group_lesson_id))];
	// A back-dated start reaches far into a lesson's sessions
	const data = await pagedRows(
		(from, to) =>
			supabase
				.from('pe_appointments')
				.select('id, date, hour, group_lesson_id')
				.in('group_lesson_id', lessonIds)
				.gte('date', fromDate)
				.order('id')
				.range(from, to),
		'Grup dersi saatleri alınamadı. Tekrar deneyin.'
	);

	return data
		.filter(
			(a) =>
				isPlannedFromStart(fromDate, a.date, a.hour) &&
				selected.some(
					(t) =>
						t.group_lesson_id === a.group_lesson_id &&
						t.hour === a.hour &&
						t.day === getDayOfWeekFromDate(a.date)
				)
		)
		.map(({ id, date, hour }) => ({ id, date, hour }))
		.sort(compareSlots)
		.slice(0, totalSessions);
}
