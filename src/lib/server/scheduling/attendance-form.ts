import type { AbsenceOutcome, Attendance } from '$lib/types/Schedule';
import { getFormDataString } from '$lib/utils/form-utils';

const INVALID = 'Formda eksik bilgi var. Sayfayı yenileyip tekrar deneyin.';

/** The enrollment (a trainee at a lesson) a form posts, or an error string. */
export function parseEnrollmentId(formData: FormData): number | string {
	const id = Number(getFormDataString(formData, 'enrollmentId'));
	return Number.isInteger(id) && id > 0 ? id : INVALID;
}

/** The attendance a form posts: "attended", "absent", or "" to clear it; a string is an error. */
export function parseAttendance(formData: FormData): { attendance: Attendance | null } | string {
	const value = getFormDataString(formData, 'attendance');
	if (value === '') return { attendance: null };
	return value === 'attended' || value === 'absent' ? { attendance: value } : INVALID;
}

/** What to do about a missed lesson, with the target session a make-up names. */
export function parseAbsenceDecision(
	formData: FormData
): { outcome: AbsenceOutcome; targetAppointmentId: number | null } | string {
	const outcome = getFormDataString(formData, 'outcome');
	if (outcome !== 'burned' && outcome !== 'shifted' && outcome !== 'makeup') return INVALID;
	const raw = getFormDataString(formData, 'targetAppointmentId');
	const targetAppointmentId = raw === '' ? null : Number(raw);
	if (targetAppointmentId !== null && !Number.isInteger(targetAppointmentId)) return INVALID;
	if (outcome === 'makeup' && targetAppointmentId === null)
		return 'Telafi için bir grup dersi seçin';
	return { outcome, targetAppointmentId };
}

/** The session a make-up moves to. */
export function parseTargetAppointmentId(formData: FormData): number | string {
	const id = Number(getFormDataString(formData, 'targetAppointmentId'));
	return Number.isInteger(id) && id > 0 ? id : 'Telafi için bir grup dersi seçin';
}
