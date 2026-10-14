import { deserialize } from '$app/forms';
import type { ActionResult } from '@sveltejs/kit';
import type { ActionPayload } from '$lib/types/Api';
import type { CapacityIssue, OccupiedSlot, SlotRange } from '$lib/types/Conflict';

/**
 * Posts to a form action of the current page outside `use:enhance` and decodes the
 * result with SvelteKit's own serializer, so server messages arrive intact.
 */
export async function postAction(
	action: string,
	formData: FormData
): Promise<ActionResult<ActionPayload, ActionPayload>> {
	const response = await fetch(`?/${action}`, {
		method: 'POST',
		body: formData,
		headers: { 'x-sveltekit-action': 'true' }
	});
	return deserialize(await response.text());
}

/** Message to show for a non-success action result. */
export function actionResultMessage(result: ActionResult<ActionPayload, ActionPayload>): string {
	if (result.type === 'failure') return result.data?.message ?? 'Bir hata oluştu';
	if (result.type === 'error') return result.error?.message ?? 'Bir hata oluştu';
	return 'Bir hata oluştu';
}

function rangeQuery({ roomId, trainerId, startDate, endDate }: SlotRange): string {
	return new URLSearchParams({
		room_id: roomId,
		trainer_id: trainerId,
		start_date: startDate,
		end_date: endDate
	}).toString();
}

/** Appointments occupying the room or the trainer in the range (/api/check-conflicts). */
export async function fetchOccupiedSlots(range: SlotRange): Promise<OccupiedSlot[]> {
	const response = await fetch(`/api/check-conflicts?${rangeQuery(range)}`);
	if (!response.ok) throw new Error('Çakışma kontrolü yapılamadı');
	const body: { appointments: OccupiedSlot[] } = await response.json();
	return body.appointments;
}

/** Group sessions of the room and trainer in the range that are full (/api/check-group-capacity). */
export async function fetchCapacityIssues(range: SlotRange): Promise<CapacityIssue[]> {
	const response = await fetch(`/api/check-group-capacity?${rangeQuery(range)}`);
	if (!response.ok) throw new Error('Kontenjan kontrolü yapılamadı');
	const body: { capacityIssues: CapacityIssue[] } = await response.json();
	return body.capacityIssues;
}
