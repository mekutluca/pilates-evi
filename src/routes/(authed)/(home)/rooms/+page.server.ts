import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getFormDataUuid, getRequiredFormDataString } from '$lib/utils/form-utils';
import { moveRow, nextSortOrder } from '$lib/server/reorder';
import { requireAdmin } from '$lib/server/permissions';
import { dbErrorMessage } from '$lib/server/db-errors';
import { futureLessonsBlock } from '$lib/server/archive';

const NOT_FOUND = 'Oda bulunamadı. Sayfayı yenileyin.';

export const actions: Actions = {
	createRoom: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = requireAdmin(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const name = getRequiredFormDataString(formData, 'name').trim();
		const sortOrder = await nextSortOrder(supabase, 'pe_rooms');

		const { data: roomData, error: createError } = await supabase
			.from('pe_rooms')
			.insert({
				name,
				sort_order: sortOrder
			})
			.select()
			.single();

		if (createError || !roomData) {
			return fail(500, {
				success: false,
				message: dbErrorMessage(createError, 'Oda kaydedilemedi. Tekrar deneyin.')
			});
		}

		return { success: true, message: 'Oda başarıyla oluşturuldu' };
	},

	updateRoom: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = requireAdmin(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const roomId = getFormDataUuid(formData, 'roomId');
		if (!roomId) return fail(400, { success: false, message: NOT_FOUND });
		const name = getRequiredFormDataString(formData, 'name').trim();

		const { data: updated, error: updateError } = await supabase
			.from('pe_rooms')
			.update({ name })
			.eq('id', roomId)
			.select('id');

		if (updateError) {
			return fail(500, {
				success: false,
				message: dbErrorMessage(updateError, 'Oda kaydedilemedi. Tekrar deneyin.')
			});
		}
		if ((updated ?? []).length === 0) return fail(404, { success: false, message: NOT_FOUND });

		return { success: true, message: 'Oda başarıyla güncellendi' };
	},

	archiveRoom: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = requireAdmin(user, userRole);
		if (permissionError) return permissionError;

		const roomId = getFormDataUuid(await request.formData(), 'roomId');
		if (!roomId) return fail(400, { success: false, message: NOT_FOUND });

		const blocked = await futureLessonsBlock(
			supabase,
			'room_id',
			roomId,
			'Bu odanın gelecek randevuları var. Odayı arşivlemeden önce randevuları başka bir odaya taşıyın.'
		);
		if (blocked) return blocked;

		const { data: archived, error: archiveError } = await supabase
			.from('pe_rooms')
			.update({ is_active: false })
			.eq('id', roomId)
			.select('id');

		if (archiveError) {
			return fail(500, {
				success: false,
				message: dbErrorMessage(archiveError, 'Oda arşivlenemedi. Tekrar deneyin.')
			});
		}
		if ((archived ?? []).length === 0) return fail(404, { success: false, message: NOT_FOUND });

		return { success: true, message: 'Oda başarıyla arşivlendi' };
	},

	restoreRoom: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = requireAdmin(user, userRole);
		if (permissionError) return permissionError;

		const roomId = getFormDataUuid(await request.formData(), 'roomId');
		if (!roomId) return fail(400, { success: false, message: NOT_FOUND });

		const { data: restored, error: restoreError } = await supabase
			.from('pe_rooms')
			.update({ is_active: true })
			.eq('id', roomId)
			.select('id');

		if (restoreError) {
			return fail(500, {
				success: false,
				message: dbErrorMessage(restoreError, 'Oda geri yüklenemedi. Tekrar deneyin.')
			});
		}
		if ((restored ?? []).length === 0) return fail(404, { success: false, message: NOT_FOUND });

		return { success: true, message: 'Oda başarıyla geri yüklendi' };
	},

	moveRoom: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = requireAdmin(user, userRole);
		if (permissionError) return permissionError;

		return moveRow(supabase, 'pe_rooms', request);
	}
};
