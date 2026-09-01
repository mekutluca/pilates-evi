import type { HandleClientError } from '@sveltejs/kit';
import { defaultErrorMessage } from '$lib/utils/errors';

// Client-side navigation errors (a `load` in the browser throwing, a chunk
// failing to import) render the same +error.svelte; keep the message generic
// and leave the details in the console.
export const handleError: HandleClientError = ({ error, status, message }) => {
	console.error(`[${status}] ${message}`, error);
	return { message: defaultErrorMessage(status) };
};
