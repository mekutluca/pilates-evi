import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getFormDataString, getRequiredFormDataString } from '$lib/utils/form-utils';

export const actions: Actions = {
	createRoom: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
		}

		const formData = await request.formData();

		const name = getRequiredFormDataString(formData, 'name');
		const capacityStr = getFormDataString(formData, 'capacity');
		const capacity = capacityStr ? Number(capacityStr) : null;

		const { data: roomData, error: createError } = await supabase
			.from('pe_rooms')
			.insert({
				name,
				capacity
			})
			.select()
			.single();

		if (createError || !roomData) {
			return fail(500, {
				success: false,
				message: 'Oda oluşturulurken hata: ' + createError?.message
			});
		}

		return { success: true, message: 'Oda başarıyla oluşturuldu' };
	},

	updateRoom: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
		}

		const formData = await request.formData();

		const roomId = getRequiredFormDataString(formData, 'roomId');
		const name = getRequiredFormDataString(formData, 'name');
		const capacityStr = getFormDataString(formData, 'capacity');
		const capacity = capacityStr ? Number(capacityStr) : null;

		const { error: updateError } = await supabase
			.from('pe_rooms')
			.update({ name, capacity })
			.eq('id', roomId);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Oda güncellenirken hata: ' + updateError.message
			});
		}

		return { success: true, message: 'Oda başarıyla güncellendi' };
	},

	archiveRoom: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
		}

		const formData = await request.formData();
		const roomId = getRequiredFormDataString(formData, 'roomId');

		// Check if room has future appointments
		const today = new Date().toISOString().split('T')[0];
		const { data: futureAppointments, error: checkError } = await supabase
			.from('pe_appointments')
			.select('id')
			.eq('room_id', roomId)
			.gte('date', today)
			.limit(1);

		if (checkError) {
			return fail(500, {
				success: false,
				message: 'Gelecek randevular kontrol edilirken hata: ' + checkError.message
			});
		}

		if (futureAppointments && futureAppointments.length > 0) {
			return fail(400, {
				success: false,
				message:
					'Bu odanın gelecek randevuları var. Odayı arşivlemeden önce randevuları başka bir odaya aktarmalısınız.'
			});
		}

		const { error: archiveError } = await supabase
			.from('pe_rooms')
			.update({ is_active: false })
			.eq('id', roomId);

		if (archiveError) {
			return fail(500, {
				success: false,
				message: 'Oda arşivlenirken hata: ' + archiveError.message
			});
		}

		return { success: true, message: 'Oda başarıyla arşivlendi' };
	},

	restoreRoom: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
		}

		const formData = await request.formData();
		const roomId = getRequiredFormDataString(formData, 'roomId');

		const { error: restoreError } = await supabase
			.from('pe_rooms')
			.update({ is_active: true })
			.eq('id', roomId);

		if (restoreError) {
			return fail(500, {
				success: false,
				message: 'Oda geri yüklenirken hata: ' + restoreError.message
			});
		}

		return { success: true, message: 'Oda başarıyla geri yüklendi' };
	}
};
