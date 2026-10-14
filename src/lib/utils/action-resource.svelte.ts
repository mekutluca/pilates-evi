import type { ActionPayload, Loadable } from '$lib/types/Api';
import { actionResultMessage, postAction } from '$lib/utils/api-client';

/**
 * Keeps the latest result of a form action of the current page: whenever the form
 * `request` builds changes, the action runs again (after `delay` ms of quiet) and older
 * answers are dropped. `request` returning null means there is nothing to ask yet.
 * Call during component setup (it registers an effect).
 */
export function actionResource<P extends ActionPayload>(
	action: string,
	request: () => FormData | null,
	delay = 300
): { readonly current: Loadable<P> } {
	let state = $state<Loadable<P>>({ status: 'idle' });
	let token = 0;

	$effect(() => {
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
		}
	};
}
