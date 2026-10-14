import { deserialize } from '$app/forms';
import type { ActionResult } from '@sveltejs/kit';
import type { ActionPayload, LessonPlanPreviewPayload, Loadable } from '$lib/types/Api';

/**
 * Posts to a form action of the current page outside `use:enhance` and decodes the
 * result with SvelteKit's own serializer, so server messages arrive intact.
 */
export async function postAction<T extends ActionPayload = ActionPayload>(
	action: string,
	formData: FormData
): Promise<ActionResult<T, ActionPayload>> {
	const response = await fetch(`?/${action}`, {
		method: 'POST',
		body: formData,
		headers: { 'x-sveltekit-action': 'true' }
	});
	return deserialize(await response.text());
}

/** Message to show for a non-success action result. */
export function actionResultMessage<T extends ActionPayload>(
	result: ActionResult<T, ActionPayload>
): string {
	if (result.type === 'failure') return result.data?.message ?? 'Bir hata oluştu';
	if (result.type === 'error') return result.error?.message ?? 'Bir hata oluştu';
	return 'Bir hata oluştu';
}

/** A planned kayıt / group lesson can be confirmed: it has lessons and nothing blocks them. */
export function canConfirmPlan(plan: Loadable<LessonPlanPreviewPayload>): boolean {
	return (
		plan.status === 'ready' &&
		plan.value.sessions.length > 0 &&
		plan.value.conflicts.length === 0 &&
		plan.value.fullSessions === 0 &&
		plan.value.duplicateSessions === 0
	);
}
