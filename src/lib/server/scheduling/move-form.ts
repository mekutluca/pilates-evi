import type { NotifyResult } from '$lib/types/WhatsApp';
import type { MoveReason, MoveRequest, TransferScope } from '$lib/types/Transfer';
import { getFormDataString, getRequiredFormDataString } from '$lib/utils/form-utils';
import { parseSlotChanges } from '$lib/server/scheduling/slot-form';

const SCOPES: TransferScope[] = ['single', 'from_selected', 'all_from_now'];

function parseScope(formData: FormData): TransferScope | null {
	const scope = getFormDataString(formData, 'scope');
	return SCOPES.find((s) => s === scope) ?? null;
}

/** Reads a Taşı form; returns an error message for an incomplete or unknown request. */
export function parseMoveRequest(formData: FormData): MoveRequest | string {
	const appointmentId = Number(getRequiredFormDataString(formData, 'appointmentId'));
	if (!Number.isInteger(appointmentId)) return 'Geçersiz randevu';
	const traineeId = getFormDataString(formData, 'traineeId');
	const amount = Number(getFormDataString(formData, 'amount'));

	switch (getFormDataString(formData, 'kind')) {
		case 'transfer': {
			const scope = parseScope(formData);
			if (!scope) return 'Geçersiz kapsam';
			return {
				kind: 'transfer',
				appointmentId,
				scope,
				roomId: getFormDataString(formData, 'roomId') || undefined,
				trainerId: getFormDataString(formData, 'trainerId') || undefined
			};
		}
		case 'pattern': {
			// A group lesson's program changes for everyone, never for one trainee
			if (traineeId) return 'Geçersiz taşıma türü';
			const slotChanges = parseSlotChanges(getFormDataString(formData, 'slotChanges'));
			if (!slotChanges || slotChanges.length === 0) return 'Yeni gün veya saat seçin';
			return { kind: 'pattern', appointmentId, slotChanges };
		}
		case 'weeks': {
			const scope = parseScope(formData);
			if (!scope) return 'Geçersiz kapsam';
			return traineeId
				? { kind: 'trainee_weeks', appointmentId, traineeId, weeks: amount }
				: { kind: 'weeks', appointmentId, scope, weeks: amount };
		}
		case 'slots':
			return traineeId
				? { kind: 'trainee_slots', appointmentId, traineeId, slots: amount }
				: { kind: 'slots', appointmentId, slots: amount };
		default:
			return 'Geçersiz taşıma türü';
	}
}

/** Who asked for the change; the studio must give a cause (it goes into the message). */
export function parseMoveReason(formData: FormData): MoveReason | string {
	if (getFormDataString(formData, 'source') !== 'studio') return { source: 'trainee' };
	const cause = getFormDataString(formData, 'cause').trim();
	return cause ? { source: 'studio', cause } : 'Stüdyo kaynaklı değişiklikler için sebep gerekli';
}

/** The notify checkbox (sent as "true" when ticked). */
export function wantsNotification(formData: FormData): boolean {
	return getFormDataString(formData, 'notify') === 'true';
}

/** Appended to a success message when clients were messaged (null: not asked to). */
export function notifiedSuffix(result: NotifyResult | null): string {
	if (!result) return '';
	if (result.disabled) return ' Bu stüdyoda WhatsApp kapalı, mesaj gönderilmedi.';
	const sent = result.sent > 0 ? ` ${result.sent} öğrenciye WhatsApp mesajı gönderildi.` : '';
	const failed =
		result.failed > 0
			? ` ${result.failed} öğrenciye mesaj gönderilemedi, onlara ayrıca haber verin.`
			: '';
	return sent + failed;
}
