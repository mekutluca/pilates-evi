import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	asAbsenceOutcome,
	asAttendance,
	attendanceSummary,
	creditLabel,
	formatAttendanceSummary,
	isAttendanceOpen
} from '$lib/utils/attendance-utils';

describe('attendance values', () => {
	test('reads the database values and nothing else', () => {
		expect(asAttendance('attended')).toBe('attended');
		expect(asAttendance('absent')).toBe('absent');
		expect(asAttendance(null)).toBeNull();
		expect(asAttendance('maybe')).toBeNull();
		expect(asAbsenceOutcome('makeup')).toBe('makeup');
		expect(asAbsenceOutcome('shifted')).toBe('shifted');
		expect(asAbsenceOutcome('burned')).toBe('burned');
		expect(asAbsenceOutcome(undefined)).toBeNull();
	});
});

describe('isAttendanceOpen', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 9, 27, 14, 30));
	});
	afterEach(() => vi.useRealTimers());

	test('opens at the lesson start hour', () => {
		expect(isAttendanceOpen('2026-10-27', 14)).toBe(true);
		expect(isAttendanceOpen('2026-10-27', 15)).toBe(false);
		expect(isAttendanceOpen('2026-10-26', 20)).toBe(true);
	});
});

describe('attendanceSummary', () => {
	test('counts who came, who did not and who is unmarked', () => {
		const summary = attendanceSummary([
			{ attendance: 'attended' },
			{ attendance: 'attended' },
			{ attendance: 'absent' },
			{ attendance: null },
			{}
		]);
		expect(summary).toEqual({ attended: 2, absent: 1, unmarked: 2 });
		expect(formatAttendanceSummary(summary)).toBe('2 geldi · 1 gelmedi · 2 işaretlenmedi');
	});

	test('reads "not taken" when nobody is marked and stays quiet on empty lessons', () => {
		expect(formatAttendanceSummary({ attended: 0, absent: 0, unmarked: 3 })).toBe(
			'Yoklama alınmadı'
		);
		expect(formatAttendanceSummary({ attended: 4, absent: 0, unmarked: 0 })).toBe('4 geldi');
		expect(formatAttendanceSummary({ attended: 0, absent: 0, unmarked: 0 })).toBe('');
	});
});

describe('creditLabel', () => {
	test('names the credits left like the reschedule credit', () => {
		expect(creditLabel(2)).toBe('2 kaldı');
		expect(creditLabel(0)).toBe('Hakkı yok');
		expect(creditLabel(999)).toBe('Sınırsız');
		expect(creditLabel(null)).toBe('-');
	});
});
