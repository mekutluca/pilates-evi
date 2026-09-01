import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getRequiredFormDataString } from '$lib/utils/form-utils';
import { cancelDay } from '$lib/utils/day-cancellation-utils';
import { getWhatsAppRepository } from '$lib/whatsapp';
import { formatDateForDB } from '$lib/utils/date-utils';
import type { DayCancellationStrategy } from '$lib/types/Operation';
import { requireStaff } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ locals: { user, userRole } }) => {
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}
	return {};
};

export const actions: Actions = {
	cancelDay: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const date = getRequiredFormDataString(formData, 'date');
		const reason = getRequiredFormDataString(formData, 'reason');

		// Day cancellation only applies to future days; today and earlier are rejected (the UI
		// also constrains the date picker, this is the backstop).
		if (date <= formatDateForDB(new Date())) {
			return fail(400, {
				success: false,
				message: 'Sadece yarın ve sonrası için gün iptali yapılabilir'
			});
		}

		const strategyRaw = formData.get('strategy')?.toString();
		const strategy: DayCancellationStrategy =
			strategyRaw === 'force' || strategyRaw === 'closest' ? strategyRaw : 'shift';

		// Resolution passes restrict the operation to the previously-conflicting appointments.
		const idsRaw = formData.get('appointmentIds')?.toString();
		const appointmentIds = idsRaw
			? idsRaw
					.split(',')
					.map(Number)
					.filter((n) => Number.isFinite(n))
			: undefined;

		const result = await cancelDay(supabase, { date, appointmentIds, strategy });
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
		if (result.deletedCount > 0) parts.push(`${result.deletedCount} boş randevu silindi`);
		if (notifiedCount > 0) parts.push(`${notifiedCount} öğrenciye bilgi mesajı gönderildi`);
		if (result.conflicts.length > 0) {
			parts.push(`${result.conflicts.length} randevu çakışma nedeniyle kaydırılamadı`);
		}
		const message = parts.length > 0 ? `${parts.join(', ')}.` : 'Bu günde işlenecek randevu yok.';

		return {
			success: true,
			message,
			shiftedCount: result.shiftedCount,
			deletedCount: result.deletedCount,
			notifiedCount,
			conflicts: result.conflicts,
			warnings: result.warnings
		};
	}
};
