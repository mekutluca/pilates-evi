import { deserialize } from '$app/forms';
import { goto } from '$app/navigation';
import { REQUEST_FAILED } from '$lib/utils/enhance';
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
	let result: ActionResult<T, ActionPayload>;
	try {
		const response = await fetch(`?/${action}`, {
			method: 'POST',
			body: formData,
			headers: { 'x-sveltekit-action': 'true' }
		});
		result = deserialize(await response.text());
	} catch (requestError) {
		// Offline, or an answer that isn't an action result (a proxy error page): never throws,
		// so callers' busy flags always reset
		console.error(`Action ${action} failed:`, requestError);
		return { type: 'error', status: 0, error: new Error(REQUEST_FAILED) };
	}
	// An expired session redirects to the login page
	if (result.type === 'redirect') await goto(result.location);
	return result;
}

/** Message to show for a non-success action result. */
export function actionResultMessage<T extends ActionPayload>(
	result: ActionResult<T, ActionPayload>
): string {
	if (result.type === 'failure') return result.data?.message ?? 'Bir hata oluştu';
	if (result.type === 'error') return result.error?.message ?? REQUEST_FAILED;
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
