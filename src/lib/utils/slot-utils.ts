import {
	DAYS_OF_WEEK,
	JS_DAY_TO_NAME,
	type AppointmentSlotRef,
	type DayOfWeek,
	type GroupSessionRef,
	type ResolvedSlotChanges,
	type ShiftedTraineeRecord,
	type SlotChange,
	type SlotRef,
	type SlotShift,
	type SortedTraineeRecord,
	type TraineeGroupSlot,
	type WeeklySlot
} from '$lib/types/Schedule';
import type { StartingAppointmentCandidate } from '$lib/types/Extension';
import type { SelectedGroupTimeslot } from '$lib/types';
import { addDaysToDate, formatDateForDB, getDayOfWeekFromDate, parseLocalDate } from './date-utils';

// Monday-first ordering used for recurring weekly time-slot patterns.
export const DAY_ORDER: Record<DayOfWeek, number> = {
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6,
	sunday: 7
};

const SHORT_DAY_NAMES: Record<DayOfWeek, string> = {
	monday: 'Pzt',
	tuesday: 'Sal',
	wednesday: 'Çar',
	thursday: 'Per',
	friday: 'Cum',
	saturday: 'Cmt',
	sunday: 'Paz'
};

/**
 * A weekly pattern for people: "Sal, Per · 10:00" when every day shares the hour,
 * otherwise "Sal 10:00, Per 18:00".
 */
export function formatWeeklyPattern(slots: WeeklySlot[]): string {
	const sorted = sortTimeSlots(slots);
	const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;
	if (sorted.length > 0 && sorted.every((s) => s.hour === sorted[0].hour)) {
		return `${sorted.map((s) => SHORT_DAY_NAMES[s.day]).join(', ')} · ${hour(sorted[0].hour)}`;
	}
	return sorted.map((s) => `${SHORT_DAY_NAMES[s.day]} ${hour(s.hour)}`).join(', ');
}

/** A weekly slot as a key and in forms: "monday-10". */
export function weeklySlotKey(slot: { day: string; hour: number }): string {
	return `${slot.day}-${slot.hour}`;
}

/** A group lesson's weekly slot as a key and in forms: "<groupLessonId>|monday|10". */
export function groupSlotKey(slot: SelectedGroupTimeslot): string {
	return `${slot.group_lesson_id}|${slot.day}|${slot.hour}`;
}

// The weekly group slot a dated lesson of a group lesson is on
function groupSlotOf(groupLessonId: string, slot: SlotRef): SelectedGroupTimeslot {
	return { group_lesson_id: groupLessonId, day: getDayOfWeekFromDate(slot.date), hour: slot.hour };
}

/** The sessions on the given group slots (a lesson's day and hour), in calendar order. */
export function sessionsOnGroupSlots<T extends GroupSessionRef>(
	slots: SelectedGroupTimeslot[],
	sessions: T[]
): T[] {
	const keys = new Set(slots.map(groupSlotKey));
	return sessions
		.filter((s) => keys.has(groupSlotKey(groupSlotOf(s.groupLessonId, s))))
		.sort(compareSlots);
}

/**
 * The sessions a group member's lessons run through: the sessions of their group lessons
 * on the days and hours they attend in each, merged in calendar order. A member of two
 * one-day lessons (Salı 09:00 and Perşembe 09:00) walks Tue → Thu → Tue, exactly like a
 * member of one Tue/Thu lesson; a member coming Wed/Thu to a Mon–Sun lesson walks
 * Wed → Thu → Wed.
 */
export function memberGroupSessions<T extends GroupSessionRef>(
	attended: TraineeGroupSlot[],
	sessions: T[]
): T[] {
	const slots = attended.flatMap((r) => (r.groupLessonId ? [groupSlotOf(r.groupLessonId, r)] : []));
	return sessionsOnGroupSlots(slots, sessions);
}

/**
 * Moves a group member's lessons from `records[startIndex]` on `slots` positions forward
 * through their sessions (memberGroupSessions). Lessons outside those sessions stay where
 * they are. Null when the sessions run out before the last lesson's target.
 */
export function planMemberSlotShift(
	records: SortedTraineeRecord[],
	startIndex: number,
	sessions: AppointmentSlotRef[],
	slots: number
): ShiftedTraineeRecord[] | null {
	const position = new Map(sessions.map((s, i) => [s.id, i]));
	const moves: ShiftedTraineeRecord[] = [];
	for (const record of records.slice(startIndex)) {
		const index = position.get(record.appointmentId);
		if (index === undefined) continue;
		const target = sessions[index + slots];
		if (!target) return null;
		moves.push({
			recordId: record.recordId,
			oldAppointmentId: record.appointmentId,
			newAppointmentId: target.id
		});
	}
	return moves;
}

/** Chronological order of concrete slots (date, then hour). */
export function compareSlots(a: SlotRef, b: SlotRef): number {
	return a.date.localeCompare(b.date) || a.hour - b.hour;
}

export function sortTimeSlots<T extends WeeklySlot>(slots: T[]): T[] {
	return [...slots].sort((a, b) => {
		const dayDiff = DAY_ORDER[a.day] - DAY_ORDER[b.day];
		if (dayDiff !== 0) return dayDiff;
		return a.hour - b.hour;
	});
}

// Lessons in a usual week of a run: the most common weekly count (the larger on a tie),
// leaving out the first and last weeks, which are often partial
function usualWeeklyCount(perWeek: Map<string, number>): number {
	const counts = [...perWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, n]) => n);
	const inner = counts.slice(1, -1);
	if (inner.length === 0) return Math.max(...counts);
	const frequency = new Map<number, number>();
	for (const n of inner) frequency.set(n, (frequency.get(n) ?? 0) + 1);
	return [...frequency.entries()].sort(([a, fa], [b, fb]) => fb - fa || b - a)[0][0];
}

/**
 * The weekly pattern a run of lessons follows now: the (day, hour) slots that recur. A
 * lesson moved once shows up a single time and is left out, so it doesn't add a weekday
 * to the pattern; when nothing recurs (a last week) every slot counts. After a change of
 * the weekly program the old slots stop recurring early: the recurring slots that go on
 * latest are kept, as many as the run has lessons in a usual week.
 */
export function recurringPattern(lessons: SlotRef[]): WeeklySlot[] {
	const entries = new Map<string, { slot: WeeklySlot; count: number; last: string }>();
	const perWeek = new Map<string, number>();
	for (const { date, hour } of lessons) {
		const slot = { day: getDayOfWeekFromDate(date), hour };
		const entry = entries.get(weeklySlotKey(slot)) ?? { slot, count: 0, last: date };
		entry.count++;
		if (date > entry.last) entry.last = date;
		entries.set(weeklySlotKey(slot), entry);
		const week = formatDateForDB(getMondayOf(parseLocalDate(date)));
		perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
	}
	const all = [...entries.values()];
	const recurring = all.filter((e) => e.count > 1);
	if (recurring.length === 0) return sortTimeSlots(all.map((e) => e.slot));
	const latestFirst = recurring.sort((a, b) => b.last.localeCompare(a.last) || b.count - a.count);
	return sortTimeSlots(latestFirst.slice(0, usualWeeklyCount(perWeek)).map((e) => e.slot));
}

// A slot change moves lessons by less than a week; a week or more is Hafta kaydır
export const MAX_SLOT_SHIFT_DAYS = 6;

/** The weekday `days` days after `day` (before it when negative). */
export function shiftWeekday(day: DayOfWeek, days: number): DayOfWeek {
	return DAYS_OF_WEEK[(((DAY_ORDER[day] - 1 + days) % 7) + 7) % 7];
}

/** The weekly slot a slot's lessons recur on after a shift. */
export function shiftedSlot(slot: WeeklySlot, shift: SlotShift): WeeklySlot {
	return { day: shiftWeekday(slot.day, shift.days), hour: shift.hour };
}

/** The date of the first lesson on `slot` at or after `start`. */
export function firstSlotDate(slot: WeeklySlot, start: SlotRef): string {
	for (let i = 0; i < 8; i++) {
		const date = addDaysToDate(start.date, i);
		if (
			getDayOfWeekFromDate(date) === slot.day &&
			compareSlots({ date, hour: slot.hour }, start) >= 0
		) {
			return date;
		}
	}
	// A weekday comes back within eight days
	throw new Error('No date for the weekly slot');
}

/**
 * Where a lesson goes when its weekly slot changed: its shift's number of days later, at
 * the new hour; null when its slot didn't change.
 */
export function slotChangeTarget(
	lesson: SlotRef,
	changes: ResolvedSlotChanges['changes']
): SlotRef | null {
	const shift = changes.get(
		weeklySlotKey({ day: getDayOfWeekFromDate(lesson.date), hour: lesson.hour })
	);
	return shift ? { date: addDaysToDate(lesson.date, shift.days), hour: shift.hour } : null;
}

/**
 * A weekly pattern with some of its slots moved to a new day or hour (Haftalık program,
 * Grup dersini taşı): the shifts by old slot key and the new pattern, or an error message.
 */
export function resolveSlotChanges(
	pattern: WeeklySlot[],
	slotChanges: SlotChange[]
): ResolvedSlotChanges | string {
	if (
		slotChanges.some((c) => !Number.isInteger(c.days) || Math.abs(c.days) > MAX_SLOT_SHIFT_DAYS)
	) {
		return `Yeni tarih ilk dersten en fazla ${MAX_SLOT_SHIFT_DAYS} gün önce veya sonra olabilir`;
	}
	const changes = new Map(
		slotChanges
			.filter((c) => c.days !== 0 || c.hour !== c.from.hour)
			.map((c) => [weeklySlotKey(c.from), { days: c.days, hour: c.hour }] as const)
	);
	const patternKeys = new Set(pattern.map(weeklySlotKey));
	if ([...changes.keys()].some((key) => !patternKeys.has(key))) {
		return 'Seçilen saat dersin haftalık programında yok';
	}
	const slots = pattern.map((s) => {
		const shift = changes.get(weeklySlotKey(s));
		return shift ? shiftedSlot(s, shift) : s;
	});
	if (new Set(slots.map(weeklySlotKey)).size !== slots.length) {
		return 'İki ders saati aynı gün ve saate taşınamaz';
	}
	return { changes, slots: sortTimeSlots(slots) };
}

/** Changed slots as the Taşı forms send them: "tuesday-9>-1:9,…" (slot>days:hour). */
export function formatSlotChanges(from: WeeklySlot[], shifts: SlotShift[]): string {
	return from
		.flatMap((slot, i) =>
			shifts[i] && (shifts[i].days !== 0 || shifts[i].hour !== slot.hour)
				? [`${weeklySlotKey(slot)}>${shifts[i].days}:${shifts[i].hour}`]
				: []
		)
		.join(',');
}

/**
 * Whether (date, hour) is one of the pattern's recurring slots — the precondition of
 * buildAppointmentSlotsFromStart, for callers that would rather skip than throw.
 */
export function isSlotInPattern(timeSlots: WeeklySlot[], date: Date, hour: number): boolean {
	const dayName = JS_DAY_TO_NAME[date.getDay()];
	return timeSlots.some((s) => s.day === dayName && s.hour === hour);
}

function getMondayOf(date: Date): Date {
	const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const dayOfWeek = d.getDay();
	const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
	d.setDate(d.getDate() - daysFromMonday);
	return d;
}

/**
 * The earliest start of a renewal: the day after the kayıt's last lesson, even when that
 * is in the past (a back-dated renewal while onboarding); today when it has no lessons.
 */
export function calculateExtensionStartDate(lastAppointmentDate: Date | null): Date {
	if (!lastAppointmentDate) {
		const now = new Date();
		return new Date(now.getFullYear(), now.getMonth(), now.getDate());
	}
	const startDate = new Date(
		lastAppointmentDate.getFullYear(),
		lastAppointmentDate.getMonth(),
		lastAppointmentDate.getDate()
	);
	startDate.setDate(startDate.getDate() + 1);
	return startDate;
}

/**
 * Returns the next `count` valid (date, hour) starting candidates from the time-slot pattern,
 * starting at `fromDate` (inclusive). Candidates are sorted chronologically.
 */
export function getStartingAppointmentCandidates(
	timeSlots: WeeklySlot[],
	fromDate: Date,
	count: number
): StartingAppointmentCandidate[] {
	if (timeSlots.length === 0 || count <= 0) return [];

	const sortedSlots = sortTimeSlots(timeSlots);
	const fromLocal = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
	const startMonday = getMondayOf(fromLocal);

	const candidates: StartingAppointmentCandidate[] = [];
	let weekOffset = 0;

	while (candidates.length < count && weekOffset < 60) {
		for (const slot of sortedSlots) {
			const slotDate = new Date(startMonday);
			slotDate.setDate(startMonday.getDate() + weekOffset * 7 + (DAY_ORDER[slot.day] - 1));

			if (slotDate >= fromLocal) {
				candidates.push({
					date: formatDateForDB(slotDate),
					hour: slot.hour,
					day: slot.day
				});
				if (candidates.length >= count) break;
			}
		}
		weekOffset++;
	}

	return candidates;
}

/**
 * Builds `totalSlots` consecutive appointment slots cycling through the time-slot pattern,
 * starting at the given (startDate, startHour) which must match one of the time slots
 * (by day-of-week and hour). The result preserves chronological order.
 */
export function buildAppointmentSlotsFromStart(
	startDate: Date,
	startHour: number,
	timeSlots: WeeklySlot[],
	totalSlots: number
): SlotRef[] {
	if (totalSlots <= 0 || timeSlots.length === 0) return [];

	const sortedSlots = sortTimeSlots(timeSlots);
	const startDayName = JS_DAY_TO_NAME[startDate.getDay()];
	const startIdx = sortedSlots.findIndex((s) => s.day === startDayName && s.hour === startHour);

	if (startIdx === -1) {
		throw new Error(
			`Başlangıç randevusu (${formatDateForDB(startDate)} ${startHour}:00) ders saatleri ile uyuşmuyor`
		);
	}

	const startMonday = getMondayOf(startDate);
	const slots: SlotRef[] = [];

	for (let i = 0; i < totalSlots; i++) {
		const idx = (startIdx + i) % sortedSlots.length;
		const weekOffset = Math.floor((startIdx + i) / sortedSlots.length);
		const slot = sortedSlots[idx];

		const slotDate = new Date(startMonday);
		slotDate.setDate(startMonday.getDate() + weekOffset * 7 + (DAY_ORDER[slot.day] - 1));

		slots.push({
			date: formatDateForDB(slotDate),
			hour: slot.hour
		});
	}

	return slots;
}
