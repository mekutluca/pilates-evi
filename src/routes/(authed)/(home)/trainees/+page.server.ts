import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import type { Role } from '$lib/types/Role';
import type { User } from '@supabase/auth-js';
import { getRequiredFormDataString, getFormDataString } from '$lib/utils/form-utils';

// Helper function to validate user permissions
function validateUserPermission(user: User | null, userRole: Role | null) {
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
	}
	return null;
}

export const actions: Actions = {
	createTrainee: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const name = getRequiredFormDataString(formData, 'name');
		const email = getRequiredFormDataString(formData, 'email');
		const phone = getRequiredFormDataString(formData, 'phone');
		const notes = getFormDataString(formData, 'notes');

		// Validate email format
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { success: false, message: 'Geçerli bir email adresi girin' });
		}

		const { error: createError } = await supabase.from('pe_trainees').insert({
			name,
			email,
			phone,
			notes: notes || null
		});

		if (createError) {
			return fail(500, {
				success: false,
				message: 'Öğrenci oluşturulurken hata: ' + createError.message
			});
		}

		return { success: true, message: 'Öğrenci başarıyla oluşturuldu' };
	},

	updateTrainee: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const traineeId = Number(getRequiredFormDataString(formData, 'traineeId'));
		const name = getRequiredFormDataString(formData, 'name');
		const email = getRequiredFormDataString(formData, 'email');
		const phone = getRequiredFormDataString(formData, 'phone');
		const notes = getFormDataString(formData, 'notes');

		if (isNaN(traineeId)) {
			return fail(400, { success: false, message: 'Geçersiz öğrenci ID' });
		}

		// Validate email format
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { success: false, message: 'Geçerli bir email adresi girin' });
		}

		const { error: updateError } = await supabase
			.from('pe_trainees')
			.update({
				name,
				email,
				phone,
				notes: notes || null
			})
			.eq('id', traineeId);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Öğrenci güncellenirken hata: ' + updateError.message
			});
		}

		return { success: true, message: 'Öğrenci başarıyla güncellendi' };
	},

	archiveTrainee: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();
		const traineeId = Number(formData.get('traineeId'));

		if (!traineeId) {
			return fail(400, { success: false, message: 'Öğrenci ID gereklidir' });
		}

		const { error: archiveError } = await supabase
			.from('pe_trainees')
			.update({ is_active: false })
			.eq('id', traineeId);

		if (archiveError) {
			return fail(500, {
				success: false,
				message: 'Öğrenci arşivlenirken hata: ' + archiveError.message
			});
		}

		return { success: true, message: 'Öğrenci başarıyla arşivlendi' };
	},

	restoreTrainee: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();
		const traineeId = Number(formData.get('traineeId'));

		if (!traineeId) {
			return fail(400, { success: false, message: 'Öğrenci ID gereklidir' });
		}

		const { error: restoreError } = await supabase
			.from('pe_trainees')
			.update({ is_active: true })
			.eq('id', traineeId);

		if (restoreError) {
			return fail(500, {
				success: false,
				message: 'Öğrenci geri yüklenirken hata: ' + restoreError.message
			});
		}

		return { success: true, message: 'Öğrenci başarıyla geri yüklendi' };
	}
};
