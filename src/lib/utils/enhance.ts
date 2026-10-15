import type { SubmitFunction } from '@sveltejs/kit';
import type { EnhanceFormOptions } from '$lib/types/Api';
import { toast } from 'svelte-sonner';

/** Shown when a request never got an answer (offline, server down, a non-action response). */
export const REQUEST_FAILED = 'İşlem tamamlanamadı. Bağlantınızı kontrol edip tekrar deneyin.';

/**
 * The standard `use:enhance` handler: a busy flag while posting, a toast for the outcome,
 * and on a network or server error the form stays where it is with what was typed (SvelteKit
 * would otherwise replace the page with its error page).
 */
export function enhanceForm(options: EnhanceFormOptions = {}): SubmitFunction {
	return () => {
		options.busy?.(true);
		return async ({ result, update }) => {
			options.busy?.(false);
			if (result.type === 'error') {
				// With a status the server answered (a 400's own message, a 500's generic one);
				// without one the request failed and the message is the browser's English text
				toast.error((result.status && result.error?.message) || REQUEST_FAILED);
				return;
			}
			if (result.type === 'success') {
				const serverMessage = result.data?.message;
				const message =
					options.success ?? (typeof serverMessage === 'string' ? serverMessage : undefined);
				if (message) toast.success(message);
				options.onSuccess?.();
			} else if (result.type === 'failure') {
				const serverMessage = result.data?.message;
				toast.error(typeof serverMessage === 'string' ? serverMessage : 'Bir hata oluştu');
			}
			await update({ reset: options.reset ?? true });
		};
	};
}
