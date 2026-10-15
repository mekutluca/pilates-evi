import type { DbErrorLike } from '$lib/types/Supabase';

// RAISE EXCEPTION in our RPCs: messages written in Turkish for users
const USER_FACING_CODE = 'P0001';

/**
 * What a user sees for a failed database call: our RPCs' own Turkish messages pass
 * through; anything else (constraint names, English driver text) is logged and replaced by
 * `fallback`, which should name the problem and the way forward.
 */
export function dbErrorMessage(error: DbErrorLike | null | undefined, fallback: string): string {
	if (error?.code === USER_FACING_CODE) return error.message;
	console.error(fallback, error);
	return fallback;
}

// Supabase Auth error codes a user can act on
const AUTH_MESSAGES: Record<string, string> = {
	email_exists: 'Bu e-posta adresi zaten kayıtlı.',
	user_already_exists: 'Bu e-posta adresi zaten kayıtlı.',
	email_address_invalid: 'Geçerli bir e-posta adresi girin.',
	weak_password: 'Şifre çok zayıf. En az 6 karakterli, tahmin edilmesi zor bir şifre seçin.',
	same_password: 'Yeni şifre eskisiyle aynı olamaz.',
	over_email_send_rate_limit: 'Çok fazla e-posta gönderildi. Birkaç dakika sonra tekrar deneyin.',
	over_request_rate_limit: 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.'
};

/** What a user sees for a failed Supabase Auth call: known codes get their own message. */
export function authErrorMessage(error: DbErrorLike | null | undefined, fallback: string): string {
	const known = error?.code ? AUTH_MESSAGES[error.code] : undefined;
	if (known) return known;
	console.error(fallback, error);
	return fallback;
}
