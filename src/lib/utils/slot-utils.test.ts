import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { WeeklySlot } from '$lib/types/Schedule';
import { parseLocalDate } from '$lib/utils/date-utils';
import {
	buildAppointmentSlotsFromStart,
	calculateExtensionStartDate,
	compareSlots,
	formatSlotChanges,
	formatWeeklyPattern,
	getStartingAppointmentCandidates,
	isSlotInPattern,
	recurringPattern,
	resolveSlotChanges,
	slotChangeTarget,
	sortTimeSlots
} from '$lib/utils/slot-utils';

// Tuesday and Friday at 10:00, given out of order on purpose
const TUE_FRI: WeeklySlot[] = [
	{ day: 'friday', hour: 10 },
	{ day: 'tuesday', hour: 10 }
];

describe('buildAppointmentSlotsFromStart', () => {
	test('walks the pattern week by week from the start slot', () => {
		expect(buildAppointmentSlotsFromStart(parseLocalDate('2026-10-20'), 10, TUE_FRI, 5)).toEqual([
			{ date: '2026-10-20', hour: 10 },
			{ date: '2026-10-23', hour: 10 },
			{ date: '2026-10-27', hour: 10 },
			{ date: '2026-10-30', hour: 10 },
			{ date: '2026-11-03', hour: 10 }
		]);
	});

	test('can start mid-pattern and crosses month and year ends', () => {
		expect(buildAppointmentSlotsFromStart(parseLocalDate('2026-12-25'), 10, TUE_FRI, 3)).toEqual([
			{ date: '2026-12-25', hour: 10 },
			{ date: '2026-12-29', hour: 10 },
			{ date: '2027-01-01', hour: 10 }
		]);
	});

	test('keeps two lessons on the same day in hour order', () => {
		const sameDay: WeeklySlot[] = [
			{ day: 'wednesday', hour: 20 },
			{ day: 'wednesday', hour: 18 }
		];
		expect(buildAppointmentSlotsFromStart(parseLocalDate('2026-10-21'), 20, sameDay, 3)).toEqual([
			{ date: '2026-10-21', hour: 20 },
			{ date: '2026-10-28', hour: 18 },
			{ date: '2026-10-28', hour: 20 }
		]);
	});

	test('refuses a start that is not one of the pattern slots', () => {
		expect(() =>
			buildAppointmentSlotsFromStart(parseLocalDate('2026-10-21'), 10, TUE_FRI, 2)
		).toThrow();
	});

	test('returns nothing for no slots or no lessons', () => {
		expect(buildAppointmentSlotsFromStart(parseLocalDate('2026-10-20'), 10, TUE_FRI, 0)).toEqual(
			[]
		);
		expect(buildAppointmentSlotsFromStart(parseLocalDate('2026-10-20'), 10, [], 3)).toEqual([]);
	});
});

describe('getStartingAppointmentCandidates', () => {
	test('lists the next pattern slots from the date on, inclusive', () => {
		expect(getStartingAppointmentCandidates(TUE_FRI, parseLocalDate('2026-10-20'), 3)).toEqual([
			{ date: '2026-10-20', hour: 10, day: 'tuesday' },
			{ date: '2026-10-23', hour: 10, day: 'friday' },
			{ date: '2026-10-27', hour: 10, day: 'tuesday' }
		]);
		expect(getStartingAppointmentCandidates(TUE_FRI, parseLocalDate('2026-10-21'), 1)).toEqual([
			{ date: '2026-10-23', hour: 10, day: 'friday' }
		]);
	});
});

describe('recurringPattern', () => {
	test('leaves out a lesson that was moved once', () => {
		const lessons = [
			{ date: '2026-10-20', hour: 10 },
			{ date: '2026-10-23', hour: 10 },
			{ date: '2026-10-28', hour: 15 }, // moved from Tuesday 27th
			{ date: '2026-10-30', hour: 10 },
			{ date: '2026-11-03', hour: 10 }
		];
		expect(recurringPattern(lessons)).toEqual([
			{ day: 'tuesday', hour: 10 },
			{ day: 'friday', hour: 10 }
		]);
	});

	test('uses every slot when none recurs (a single week)', () => {
		expect(
			recurringPattern([
				{ date: '2026-10-23', hour: 10 },
				{ date: '2026-10-20', hour: 9 }
			])
		).toEqual([
			{ day: 'tuesday', hour: 9 },
			{ day: 'friday', hour: 10 }
		]);
	});
});

describe('recurringPattern after a program change', () => {
	// Tue/Thu 12:00 from Thursday 22 October, Thursday changed to Friday from 5 November
	const lessons = [
		{ date: '2026-10-22', hour: 12 },
		{ date: '2026-10-27', hour: 12 },
		{ date: '2026-10-29', hour: 12 },
		{ date: '2026-11-03', hour: 12 },
		{ date: '2026-11-06', hour: 12 },
		{ date: '2026-11-10', hour: 12 },
		{ date: '2026-11-13', hour: 12 },
		{ date: '2026-11-17', hour: 12 }
	];

	test('follows the new program once it recurs', () => {
		expect(recurringPattern(lessons)).toEqual([
			{ day: 'tuesday', hour: 12 },
			{ day: 'friday', hour: 12 }
		]);
	});

	test('keeps the old program while the new one has a single week', () => {
		expect(recurringPattern(lessons.slice(0, 6))).toEqual([
			{ day: 'tuesday', hour: 12 },
			{ day: 'thursday', hour: 12 }
		]);
	});

	test('counts a partial first and last week as part of the run', () => {
		// Starts on a Thursday and ends on a Tuesday: weeks of 1, 2, 2 and 1 lessons
		expect(
			recurringPattern([
				{ date: '2026-10-22', hour: 12 },
				{ date: '2026-10-27', hour: 12 },
				{ date: '2026-10-29', hour: 12 },
				{ date: '2026-11-03', hour: 12 },
				{ date: '2026-11-05', hour: 12 },
				{ date: '2026-11-10', hour: 12 }
			])
		).toEqual([
			{ day: 'tuesday', hour: 12 },
			{ day: 'thursday', hour: 12 }
		]);
	});
});

describe('slot changes', () => {
	const TUE_THU = [
		{ day: 'tuesday', hour: 12 },
		{ day: 'thursday', hour: 12 }
	] satisfies WeeklySlot[];

	test('slotChangeTarget moves a changed slot within its Monday-first week', () => {
		const changes = new Map([
			['thursday-12', { day: 'friday', hour: 18 }],
			['sunday-12', { day: 'monday', hour: 9 }]
		] satisfies [string, WeeklySlot][]);
		expect(slotChangeTarget({ date: '2026-10-22', hour: 12 }, changes)).toEqual({
			date: '2026-10-23',
			hour: 18
		});
		expect(slotChangeTarget({ date: '2026-10-25', hour: 12 }, changes)).toEqual({
			date: '2026-10-19',
			hour: 9
		});
		expect(slotChangeTarget({ date: '2026-10-20', hour: 12 }, changes)).toBeNull();
	});

	test('resolveSlotChanges gives the changes and the new program', () => {
		const resolved = resolveSlotChanges(TUE_THU, [
			{ from: { day: 'thursday', hour: 12 }, to: { day: 'friday', hour: 18 } },
			{ from: { day: 'tuesday', hour: 12 }, to: { day: 'tuesday', hour: 12 } }
		]);
		expect(resolved).toEqual({
			changes: new Map([['thursday-12', { day: 'friday', hour: 18 }]]),
			slots: [
				{ day: 'tuesday', hour: 12 },
				{ day: 'friday', hour: 18 }
			]
		});
	});

	test('resolveSlotChanges rejects slots off the program and collisions', () => {
		expect(
			resolveSlotChanges(TUE_THU, [
				{ from: { day: 'monday', hour: 12 }, to: { day: 'friday', hour: 12 } }
			])
		).toBe('Seçilen saat dersin haftalık programında yok');
		expect(
			resolveSlotChanges(TUE_THU, [
				{ from: { day: 'thursday', hour: 12 }, to: { day: 'tuesday', hour: 12 } }
			])
		).toBe('İki ders saati aynı gün ve saate taşınamaz');
	});

	test('formatSlotChanges lists only the changed slots', () => {
		expect(
			formatSlotChanges(TUE_THU, [
				{ day: 'tuesday', hour: 12 },
				{ day: 'friday', hour: 12 }
			])
		).toBe('thursday-12>friday-12');
		expect(formatSlotChanges(TUE_THU, TUE_THU)).toBe('');
	});
});

describe('pattern helpers', () => {
	test('isSlotInPattern matches day and hour', () => {
		expect(isSlotInPattern(TUE_FRI, parseLocalDate('2026-10-20'), 10)).toBe(true);
		expect(isSlotInPattern(TUE_FRI, parseLocalDate('2026-10-20'), 11)).toBe(false);
		expect(isSlotInPattern(TUE_FRI, parseLocalDate('2026-10-21'), 10)).toBe(false);
	});

	test('sortTimeSlots orders Monday first, then by hour', () => {
		expect(
			sortTimeSlots([
				{ day: 'sunday', hour: 9 },
				{ day: 'monday', hour: 18 },
				{ day: 'monday', hour: 9 }
			])
		).toEqual([
			{ day: 'monday', hour: 9 },
			{ day: 'monday', hour: 18 },
			{ day: 'sunday', hour: 9 }
		]);
	});

	test('compareSlots orders by date, then hour', () => {
		const slots = [
			{ date: '2026-10-21', hour: 9 },
			{ date: '2026-10-20', hour: 18 },
			{ date: '2026-10-20', hour: 9 }
		];
		expect([...slots].sort(compareSlots)).toEqual([slots[2], slots[1], slots[0]]);
	});

	test('formatWeeklyPattern', () => {
		expect(formatWeeklyPattern(TUE_FRI)).toBe('Sal, Cum · 10:00');
		expect(
			formatWeeklyPattern([
				{ day: 'thursday', hour: 18 },
				{ day: 'tuesday', hour: 9 }
			])
		).toBe('Sal 09:00, Per 18:00');
	});
});

describe('calculateExtensionStartDate', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 9, 15, 14, 0)); // Thursday 15 Oct 2026, 14:00
	});
	afterEach(() => vi.useRealTimers());

	const start = (last: string | null) =>
		calculateExtensionStartDate(last ? parseLocalDate(last) : null).toDateString();

	test('starts the day after a last lesson that is still ahead', () => {
		expect(start('2026-10-20')).toBe(new Date(2026, 9, 21).toDateString());
		expect(start('2026-10-15')).toBe(new Date(2026, 9, 16).toDateString());
	});

	test('starts the day after a past last lesson, so an ended kayıt can renew back-dated', () => {
		expect(start('2026-10-01')).toBe(new Date(2026, 9, 2).toDateString());
	});

	test('starts today when the kayıt has no lessons', () => {
		expect(start(null)).toBe(new Date(2026, 9, 15).toDateString());
	});
});
