import type { LessonPlanInput, RenewalInput } from '$lib/types/Extension';
import type { AssignmentInput } from '$lib/types/Assignment';
import type { SelectedGroupTimeslot } from '$lib/types';
import { DAYS_OF_WEEK } from '$lib/types/Schedule';
import { getFormDataString, getFormDataUuid } from '$lib/utils/form-utils';
import { isIsoDate, isValidUuid } from '$lib/utils/validation';
import { formatDateForDB } from '$lib/utils/date-utils';
import { parseHour, parseWeeklySlots } from '$lib/server/scheduling/slot-form';

// "<groupLessonId>|monday|10,…"
function parseGroupSlots(raw: string): SelectedGroupTimeslot[] | null {
	const slots: SelectedGroupTimeslot[] = [];
	for (const part of raw.split(',').filter(Boolean)) {
		const [groupLessonId, day, hourText = ''] = part.split('|');
		const hour = parseHour(hourText);
		if (!isValidUuid(groupLessonId) || !DAYS_OF_WEEK.some((d) => d === day) || hour === null)
			return null;
		slots.push({ group_lesson_id: groupLessonId, day, hour });
	}
	return slots;
}

// The lessons part shared by the Yenile and Yeni kayıt forms
function parseLessonPlanForm(formData: FormData): LessonPlanInput | string {
	const startDate = getFormDataString(formData, 'startDate');
	if (!isIsoDate(startDate)) return 'Geçersiz başlangıç tarihi';
	if (startDate < formatDateForDB(new Date())) return 'Başlangıç tarihi geçmişte olamaz';

	if (getFormDataString(formData, 'kind') === 'group') {
		const groupSlots = parseGroupSlots(getFormDataString(formData, 'groupSlots'));
		if (!groupSlots) return 'Geçersiz grup saatleri';
		return {
			kind: 'group',
			startDate,
			groupSlots,
			weeks: Number(getFormDataString(formData, 'weeks'))
		};
	}

	const timeSlots = parseWeeklySlots(getFormDataString(formData, 'timeSlots'));
	if (!timeSlots) return 'Geçersiz ders saatleri';
	const roomId = getFormDataUuid(formData, 'roomId');
	const trainerId = getFormDataUuid(formData, 'trainerId');
	if (!roomId || !trainerId) return 'Oda ve eğitmen seçin';
	return {
		kind: 'private',
		startDate,
		timeSlots,
		roomId,
		trainerId,
		periods: Number(getFormDataString(formData, 'periods'))
	};
}

/** Reads the Yenile form; returns an error message for malformed input. */
export function parseRenewalForm(formData: FormData, purchaseId: string): RenewalInput | string {
	const lessons = parseLessonPlanForm(formData);
	return typeof lessons === 'string' ? lessons : { ...lessons, purchaseId };
}

/** Reads the Yeni kayıt form ("traineeIds" comma separated). */
export function parseAssignmentForm(formData: FormData): AssignmentInput | string {
	const lessons = parseLessonPlanForm(formData);
	if (typeof lessons === 'string') return lessons;
	const packageId = getFormDataUuid(formData, 'packageId');
	if (!packageId) return 'Paket seçin';
	return {
		...lessons,
		packageId,
		traineeIds: getFormDataString(formData, 'traineeIds').split(',').filter(Boolean)
	};
}
