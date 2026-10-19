import type { GroupLessonMoveInput, NewGroupLessonInput } from '$lib/types/GroupLesson';
import { getFormDataString, getRequiredFormDataString } from '$lib/utils/form-utils';
import { isIsoDate, isValidUuid } from '$lib/utils/validation';
import { parseSlotChanges, parseWeeklySlots } from '$lib/server/scheduling/slot-form';

/** Reads the Yeni grup dersi form; returns an error message for malformed input. */
export function parseNewGroupLessonForm(formData: FormData): NewGroupLessonInput | string {
	const packageId = getRequiredFormDataString(formData, 'packageId');
	const roomId = getRequiredFormDataString(formData, 'roomId');
	const trainerId = getRequiredFormDataString(formData, 'trainerId');
	if (![packageId, roomId, trainerId].every(isValidUuid)) return 'Paket, oda ve eğitmen seçin';
	const startDate = getRequiredFormDataString(formData, 'startDate');
	if (!isIsoDate(startDate)) return 'Geçersiz başlangıç tarihi';
	const slots = parseWeeklySlots(getFormDataString(formData, 'timeSlots'));
	if (!slots) return 'Geçersiz ders saatleri';
	return { packageId, roomId, trainerId, startDate, slots };
}

/** Reads a group lesson Taşı form ("monday-10>tuesday-11,…" slot changes). */
export function parseGroupLessonMoveForm(
	formData: FormData,
	groupLessonId: string
): GroupLessonMoveInput | string {
	const fromDate = getRequiredFormDataString(formData, 'fromDate');
	if (!isIsoDate(fromDate)) return 'Geçersiz başlangıç tarihi';

	const slotChanges = parseSlotChanges(getFormDataString(formData, 'slotChanges'));
	if (!slotChanges) return 'Geçersiz ders saatleri';

	const roomId = getFormDataString(formData, 'roomId') || undefined;
	const trainerId = getFormDataString(formData, 'trainerId') || undefined;
	if ((roomId && !isValidUuid(roomId)) || (trainerId && !isValidUuid(trainerId))) {
		return 'Geçersiz oda veya eğitmen';
	}
	return { groupLessonId, fromDate, slotChanges, roomId, trainerId };
}
