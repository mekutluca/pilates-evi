import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	addWeeksToDate,
	formatDateForDB,
	formatSlotLabel,
	formatWeekRange,
	getDayOfWeekFromDate,
	getWeekStart,
	isAppointmentFuture,
	isPastDate,
	isPlannedFromStart,
	parseLocalDate
} from '$lib/utils/date-utils';
import { isIntInRange, isValidWeekShift } from '$lib/utils/validation';

describe('dates', () => {
	test('YYYY-MM-DD round-trips as a local day', () => {
		expect(formatDateForDB(parseLocalDate('2026-03-31'))).toBe('2026-03-31');
	});

	test('a week starts on Monday, also from a Sunday', () => {
		expect(formatDateForDB(getWeekStart(parseLocalDate('2026-10-15')))).toBe('2026-10-12');
		expect(formatDateForDB(getWeekStart(parseLocalDate('2026-10-18')))).toBe('2026-10-12');
		expect(formatDateForDB(getWeekStart(parseLocalDate('2026-10-12')))).toBe('2026-10-12');
	});

	test('adding weeks crosses months and years, both ways', () => {
		expect(addWeeksToDate('2026-12-29', 1)).toBe('2027-01-05');
		expect(addWeeksToDate('2026-03-03', -1)).toBe('2026-02-24');
	});

	test('day names', () => {
		expect(getDayOfWeekFromDate('2026-10-12')).toBe('monday');
		expect(getDayOfWeekFromDate('2026-10-18')).toBe('sunday');
	});

	test('Turkish labels', () => {
		expect(formatSlotLabel('2026-10-20', 9)).toBe('Salı 20 Eki · 09:00');
		expect(formatWeekRange(parseLocalDate('2026-10-12'))).toBe('12–18 Ekim 2026');
		expect(formatWeekRange(parseLocalDate('2026-09-28'))).toBe('28 Eylül – 4 Ekim 2026');
	});
});

describe('isAppointmentFuture', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 9, 15, 14, 30)); // Thursday 15 Oct 2026, 14:30
	});
	afterEach(() => vi.useRealTimers());

	test("a lesson counts as started from its hour on, today's included", () => {
		expect(isAppointmentFuture('2026-10-15', 15)).toBe(true);
		expect(isAppointmentFuture('2026-10-15', 14)).toBe(false);
		expect(isAppointmentFuture('2026-10-14', 20)).toBe(false);
		expect(isAppointmentFuture('2026-10-16', 9)).toBe(true);
	});
});

describe('isPlannedFromStart', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 9, 15, 14, 30)); // Thursday 15 Oct 2026, 14:30
	});
	afterEach(() => vi.useRealTimers());

	test("a start in the past keeps every lesson since, today's passed hours included", () => {
		expect(isPlannedFromStart('2026-09-01', '2026-09-03', 10)).toBe(true);
		expect(isPlannedFromStart('2026-10-14', '2026-10-15', 10)).toBe(true);
	});

	test('a day is past from tomorrow on; an empty date is not', () => {
		expect(isPastDate('2026-10-14')).toBe(true);
		expect(isPastDate('2026-10-15')).toBe(false);
		expect(isPastDate('')).toBe(false);
	});

	test('starting today means from now on', () => {
		expect(isPlannedFromStart('2026-10-15', '2026-10-15', 10)).toBe(false);
		expect(isPlannedFromStart('2026-10-15', '2026-10-15', 15)).toBe(true);
	});
});

describe('validation', () => {
	test('week shifts are whole, non-zero and within a year', () => {
		expect(isValidWeekShift(1)).toBe(true);
		expect(isValidWeekShift(-52)).toBe(true);
		expect(isValidWeekShift(0)).toBe(false);
		expect(isValidWeekShift(53)).toBe(false);
		expect(isValidWeekShift(1.5)).toBe(false);
	});

	test('isIntInRange rejects empty form numbers', () => {
		expect(isIntInRange(Number(''), 1, 5)).toBe(false);
		expect(isIntInRange(Number('x'), 1, 5)).toBe(false);
		expect(isIntInRange(3, 1, 5)).toBe(true);
		expect(isIntInRange(6, 1, 5)).toBe(false);
	});
});
