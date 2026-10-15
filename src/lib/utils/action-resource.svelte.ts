import type { ActionPayload, Loadable } from '$lib/types/Api';
import { actionResultMessage, postAction } from '$lib/utils/api-client';

/**
 * Keeps the latest result of a form action of the current page: whenever the form
 * `request` builds changes, the action runs again (after `delay` ms of quiet) and older
 * answers are dropped. `request` returning null means there is nothing to ask yet; `retry()`
 * asks again after a failure. postAction never throws, so a lost connection ends as `failed`.
 * Call during component setup (it registers an effect).
 */
export function actionResource<P extends ActionPayload>(
	action: string,
	request: () => FormData | null,
	delay = 300
): { readonly current: Loadable<P>; retry: () => void } {
	let state = $state<Loadable<P>>({ status: 'idle' });
	let token = 0;
	// Bumped by retry() to run the same request again
	let attempt = $state(0);

	$effect(() => {
		void attempt;
		const form = request();
		const current = ++token;
		state = form ? { status: 'loading' } : { status: 'idle' };
		if (!form) return;
		const timer = setTimeout(async () => {
			const result = await postAction<P>(action, form);
			if (current !== token) return;
			state =
				result.type === 'success' && result.data
					? { status: 'ready', value: result.data }
					: { status: 'failed', message: actionResultMessage(result) };
		}, delay);
		return () => clearTimeout(timer);
	});

	return {
		get current() {
			return state;
		},
		retry() {
			attempt++;
		}
	};
}
