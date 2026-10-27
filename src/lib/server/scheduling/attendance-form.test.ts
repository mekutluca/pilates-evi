import { describe, expect, test } from 'vitest';
import {
	parseAbsenceDecision,
	parseAttendance,
	parseEnrollmentId,
	parseTargetAppointmentId
} from '$lib/server/scheduling/attendance-form';

function form(values: Record<string, string>): FormData {
	const data = new FormData();
	for (const [key, value] of Object.entries(values)) data.append(key, value);
	return data;
}

describe('attendance forms', () => {
	test('reads the enrollment and the mark, "" clearing it', () => {
		expect(parseEnrollmentId(form({ enrollmentId: '42' }))).toBe(42);
		expect(typeof parseEnrollmentId(form({ enrollmentId: 'x' }))).toBe('string');
		expect(typeof parseEnrollmentId(form({}))).toBe('string');
		expect(parseAttendance(form({ attendance: 'attended' }))).toEqual({ attendance: 'attended' });
		expect(parseAttendance(form({ attendance: 'absent' }))).toEqual({ attendance: 'absent' });
		expect(parseAttendance(form({ attendance: '' }))).toEqual({ attendance: null });
		expect(typeof parseAttendance(form({ attendance: 'late' }))).toBe('string');
	});

	test('reads a decision and insists on a session for a make-up', () => {
		expect(parseAbsenceDecision(form({ outcome: 'burned' }))).toEqual({
			outcome: 'burned',
			targetAppointmentId: null
		});
		expect(parseAbsenceDecision(form({ outcome: 'shifted', targetAppointmentId: '' }))).toEqual({
			outcome: 'shifted',
			targetAppointmentId: null
		});
		expect(parseAbsenceDecision(form({ outcome: 'makeup', targetAppointmentId: '7' }))).toEqual({
			outcome: 'makeup',
			targetAppointmentId: 7
		});
		expect(parseAbsenceDecision(form({ outcome: 'makeup' }))).toBe(
			'Telafi için bir grup dersi seçin'
		);
		expect(typeof parseAbsenceDecision(form({ outcome: 'forgive' }))).toBe('string');
		expect(parseTargetAppointmentId(form({ targetAppointmentId: '9' }))).toBe(9);
		expect(typeof parseTargetAppointmentId(form({}))).toBe('string');
	});
});
