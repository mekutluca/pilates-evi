import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getRequiredFormDataString } from '$lib/utils/form-utils';
import { cancelDay } from '$lib/utils/day-cancellation-utils';
import { getWhatsAppRepository } from '$lib/whatsapp';

export const load: PageServerLoad = async ({ locals: { user, userRole } }) => {
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}
	return {};
};

export const actions: Actions = {
	cancelDay: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
		}

		const formData = await request.formData();
		const date = getRequiredFormDataString(formData, 'date');
		const reason = getRequiredFormDataString(formData, 'reason');

		const result = await cancelDay(supabase, { date });
		if (result.error) {
			return fail(400, { success: false, message: result.error });
		}

		let notifiedCount = 0;
		if (result.notifications.length > 0) {
			notifiedCount = await getWhatsAppRepository().sendShiftNotifications(
				result.notifications,
				reason
			);
		}

		const parts: string[] = [];
		if (result.shiftedCount > 0) parts.push(`${result.shiftedCount} randevu kaydırıldı`);
		if (notifiedCount > 0) parts.push(`${notifiedCount} öğrenciye bilgi mesajı gönderildi`);
		if (result.conflicts.length > 0) {
			parts.push(`${result.conflicts.length} randevu çakışma nedeniyle kaydırılamadı`);
		}
		const message =
			parts.length > 0 ? `${parts.join(', ')}.` : 'Bu günde kaydırılacak randevu yok.';

		return {
			success: true,
			message,
			shiftedCount: result.shiftedCount,
			notifiedCount,
			conflicts: result.conflicts,
			warnings: result.warnings
		};
	}
};
