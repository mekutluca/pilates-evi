/**
 * Generic Turkish description for an HTTP error status. Used by both
 * `handleError` hooks (so SvelteKit's English "Not Found" / "Internal Error"
 * never reach the page) and by the error page when an `error()` call carried
 * no message of its own.
 */
export function defaultErrorMessage(status: number): string {
	if (status === 404) return 'Aradığınız adres taşınmış ya da hiç var olmamış olabilir.';
	if (status === 401 || status === 403) {
		return 'Bu sayfayı görüntülemek için gerekli yetkiye sahip değilsiniz.';
	}
	return 'Tekrar deneyin. Sorun sürerse yöneticinize bildirin.';
}
