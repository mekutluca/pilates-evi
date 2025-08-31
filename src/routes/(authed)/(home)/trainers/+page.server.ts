import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import type { Role } from '$lib/types/Role';
import type { User } from '@supabase/auth-js';
import { getRequiredFormDataString } from '$lib/utils/form-utils';

// Helper function to validate user permissions
function validateUserPermission(user: User | null, userRole: Role | null) {
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		return fail(403, {
			success: false,
			message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
		});
	}
	return null;
}

// Training system removed - no longer needed

export const actions: Actions = {
	createTrainer: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const name = getRequiredFormDataString(formData, 'name');
		const phone = getRequiredFormDataString(formData, 'phone');
		// Training assignments removed in new system

		// Create trainer in pe_trainers table
		const { data: trainerData, error: createError } = await supabase
			.from('pe_trainers')
			.insert({
				name,
				phone
			})
			.select()
			.single();

		if (createError || !trainerData) {
			return fail(500, {
				success: false,
				message: 'Eğitmen oluşturulurken hata: ' + createError?.message
			});
		}

		// Assign selected trainings to the new trainer
		// Training assignment logic removed

		return {
			success: true,
			message: 'Eğitmen başarıyla oluşturuldu'
		};
	},

	updateTrainer: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const trainerId = Number(getRequiredFormDataString(formData, 'trainerId'));
		const name = getRequiredFormDataString(formData, 'name');
		const phone = getRequiredFormDataString(formData, 'phone');
		// Training assignments removed in new system

		if (isNaN(trainerId)) {
			return fail(400, {
				success: false,
				message: 'Geçersiz eğitmen ID'
			});
		}

		// Update trainer in pe_trainers table
		const { error: updateError } = await supabase
			.from('pe_trainers')
			.update({
				name,
				phone
			})
			.eq('id', trainerId);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Eğitmen güncellenirken hata: ' + updateError.message
			});
		}

		// Update training assignments
		// Training assignment logic removed

		return {
			success: true,
			message: 'Eğitmen başarıyla güncellendi'
		};
	},

	deleteTrainer: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();
		const trainerId = Number(formData.get('trainerId'));

		// Validate required fields
		if (!trainerId) {
			return fail(400, {
				success: false,
				message: 'Eğitmen ID gereklidir'
			});
		}

		// Delete trainer from pe_trainers table
		const { error: deleteError } = await supabase.from('pe_trainers').delete().eq('id', trainerId);

		if (deleteError) {
			return fail(500, {
				success: false,
				message: 'Eğitmen silinirken hata: ' + deleteError.message
			});
		}

		return {
			success: true,
			message: 'Eğitmen başarıyla silindi'
		};
	}
};
