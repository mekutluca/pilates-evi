import type {
	AbsenceOutcome,
	AppointmentTraineeRelation,
	Attendance,
	AttendanceSummary
} from '$lib/types/Schedule';
import { isAppointmentFuture } from '$lib/utils/date-utils';

/** The attendance value a database row holds, or null for anything else (not taken). */
export function asAttendance(value: string | null | undefined): Attendance | null {
	return value === 'attended' || value === 'absent' ? value : null;
}

/** The absence outcome a database row holds, or null (awaiting a decision). */
export function asAbsenceOutcome(value: string | null | undefined): AbsenceOutcome | null {
	return value === 'burned' || value === 'shifted' || value === 'makeup' ? value : null;
}

/** Attendance can be taken once the lesson has started. */
export function isAttendanceOpen(date: string, hour: number): boolean {
	return !isAppointmentFuture(date, hour);
}

/** How a lesson's attendance stands: who came, who didn't, who is not marked yet. */
export function attendanceSummary(
	enrollments: Array<Pick<AppointmentTraineeRelation, 'attendance'>>
): AttendanceSummary {
	const summary: AttendanceSummary = { attended: 0, absent: 0, unmarked: 0 };
	for (const enrollment of enrollments) {
		if (enrollment.attendance === 'attended') summary.attended++;
		else if (enrollment.attendance === 'absent') summary.absent++;
		else summary.unmarked++;
	}
	return summary;
}

/** "4 geldi · 1 gelmedi", with the unmarked count when attendance is only partly taken. */
export function formatAttendanceSummary(summary: AttendanceSummary): string {
	const total = summary.attended + summary.absent + summary.unmarked;
	if (total === 0) return '';
	if (summary.unmarked === total) return 'Yoklama alınmadı';
	const parts = [`${summary.attended} geldi`];
	if (summary.absent > 0) parts.push(`${summary.absent} gelmedi`);
	if (summary.unmarked > 0) parts.push(`${summary.unmarked} işaretlenmedi`);
	return parts.join(' · ');
}

/** "Telafi 1 kaldı", "Sınırsız" or "Telafi hakkı yok", like the reschedule credit label. */
export function creditLabel(left: number | null | undefined): string {
	if (left === null || left === undefined) return '-';
	if (left >= 999) return 'Sınırsız';
	return left === 0 ? 'Hakkı yok' : `${left} kaldı`;
}
