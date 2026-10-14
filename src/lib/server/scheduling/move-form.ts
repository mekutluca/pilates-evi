import type { MoveReason, MoveRequest, TransferScope } from '$lib/types/Transfer';
import { getFormDataString, getRequiredFormDataString } from '$lib/utils/form-utils';

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

/** Appended to a success message when clients were messaged. */
export function notifiedSuffix(count: number): string {
	return count > 0 ? ` ${count} öğrenciye WhatsApp mesajı gönderildi.` : '';
}
