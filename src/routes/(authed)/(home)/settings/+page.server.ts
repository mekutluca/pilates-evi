import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getFormDataString } from '$lib/utils/form-utils';

const MIN_PASSWORD_LENGTH = 6;

export const actions: Actions = {
	updateEmail: async ({ request, url, locals: { supabase, user } }) => {
		if (!user) {
			return fail(401, { success: false, message: 'Oturum bulunamadı, lütfen tekrar giriş yapın' });
		}

		const formData = await request.formData();
		const email = getFormDataString(formData, 'email').trim();

		if (!email) {
			return fail(400, { success: false, message: 'E-posta adresi gereklidir' });
		}
		if (email === user.email) {
			return fail(400, { success: false, message: 'Yeni e-posta adresi mevcut adresinizle aynı' });
		}

		// The Supabase project is shared with invest-track; the change-email
		// template branches on user_metadata.app, so stamp it before the
		// confirmation email is generated.
		const { error: stampError } = await supabase.auth.updateUser({
			data: { app: 'pilates-evi' }
		});
		if (stampError) {
			return fail(500, {
				success: false,
				message: 'E-posta güncellenirken hata: ' + stampError.message
			});
		}

		// Supabase sends a confirmation link to the new address; the change takes
		// effect only after the user clicks it. The redirect URL must be on the
		// project's Redirect URLs allowlist in Supabase Auth settings.
		const { error } = await supabase.auth.updateUser(
			{ email },
			{ emailRedirectTo: `${url.origin}/settings` }
		);

		if (error) {
			return fail(500, {
				success: false,
				message: 'E-posta güncellenirken hata: ' + error.message
			});
		}

		return { success: true, message: 'Onay bağlantısı yeni e-posta adresinize gönderildi' };
	},

	updatePassword: async ({ request, locals: { supabase, user } }) => {
		if (!user?.email) {
			return fail(401, { success: false, message: 'Oturum bulunamadı, lütfen tekrar giriş yapın' });
		}

		const formData = await request.formData();
		const currentPassword = getFormDataString(formData, 'currentPassword');
		const newPassword = getFormDataString(formData, 'newPassword');
		const newPasswordConfirm = getFormDataString(formData, 'newPasswordConfirm');

		if (!currentPassword || !newPassword || !newPasswordConfirm) {
			return fail(400, { success: false, message: 'Tüm alanlar gereklidir' });
		}
		if (newPassword.length < MIN_PASSWORD_LENGTH) {
			return fail(400, {
				success: false,
				message: `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır`
			});
		}
		if (newPassword !== newPasswordConfirm) {
			return fail(400, { success: false, message: 'Yeni şifreler eşleşmiyor' });
		}
		if (newPassword === currentPassword) {
			return fail(400, { success: false, message: 'Yeni şifre mevcut şifrenizle aynı olamaz' });
		}

		// Verify the current password through the user's own session before
		// issuing the change — the service-role client is intentionally not used.
		const { error: signInError } = await supabase.auth.signInWithPassword({
			email: user.email,
			password: currentPassword
		});
		if (signInError) {
			return fail(400, { success: false, message: 'Mevcut şifreniz hatalı' });
		}

		const { error } = await supabase.auth.updateUser({ password: newPassword });
		if (error) {
			return fail(500, { success: false, message: 'Şifre güncellenirken hata: ' + error.message });
		}

		return { success: true, message: 'Şifreniz başarıyla güncellendi' };
	}
};
