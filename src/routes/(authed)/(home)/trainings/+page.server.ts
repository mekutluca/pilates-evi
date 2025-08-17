import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import type { Role } from '$lib/types/Role';
import type { User } from '@supabase/auth-js';
import { getRequiredFormDataString, getFormDataString } from '$lib/utils';

// Helper function to validate user permissions
function validateUserPermission(user: User | null, userRole: Role | null) {
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
	}
	return null;
}

export const actions: Actions = {
	createTraining: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const name = getRequiredFormDataString(formData, 'name');

		const minCapacityStr = getFormDataString(formData, 'min_capacity');
		const maxCapacityStr = getFormDataString(formData, 'max_capacity');
		const min_capacity = minCapacityStr ? Number(minCapacityStr) : 0;
		const max_capacity = maxCapacityStr ? Number(maxCapacityStr) : 0;
		const assignToAllTrainers = formData.get('assignToAllTrainers') === 'on';

		if (max_capacity > 0 && min_capacity > max_capacity) {
			return fail(400, {
				success: false,
				message: 'Minimum öğrenci sayısı maksimum öğrenci sayısından büyük olamaz'
			});
		}

		const { data: trainingData, error: createError } = await supabase
			.from('pe_trainings')
			.insert({ name, min_capacity, max_capacity })
			.select()
			.single();

		if (createError || !trainingData) {
			return fail(500, {
				success: false,
				message: 'Egzersiz oluşturulurken hata: ' + createError?.message
			});
		}

		// If assignToAllTrainers is checked, assign this training to all existing trainers
		if (assignToAllTrainers) {
			const { data: trainers } = await supabase.from('pe_trainers').select('id');

			if (trainers && trainers.length > 0) {
				const assignments = trainers.map((trainer) => ({
					trainer_id: trainer.id,
					training_id: trainingData.id
				}));

				const { error: assignError } = await supabase
					.from('pe_trainer_trainings')
					.insert(assignments);

				if (assignError) {
					console.error('Trainer assignment error:', assignError);
					// Don't fail the entire operation
				}
			}
		}

		return { success: true, message: 'Egzersiz başarıyla oluşturuldu' };
	},

	updateTraining: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const trainingIdStr = getRequiredFormDataString(formData, 'trainingId');
		const trainingId = Number(trainingIdStr);
		if (isNaN(trainingId)) {
			return fail(400, { success: false, message: 'Geçersiz egzersiz ID' });
		}

		const name = getRequiredFormDataString(formData, 'name');

		const minCapacityStr = getFormDataString(formData, 'min_capacity');
		const maxCapacityStr = getFormDataString(formData, 'max_capacity');
		const min_capacity = minCapacityStr ? Number(minCapacityStr) : 0;
		const max_capacity = maxCapacityStr ? Number(maxCapacityStr) : 0;

		if (max_capacity > 0 && min_capacity > max_capacity) {
			return fail(400, {
				success: false,
				message: 'Minimum öğrenci sayısı maksimum öğrenci sayısından büyük olamaz'
			});
		}

		const { error: updateError } = await supabase
			.from('pe_trainings')
			.update({ name, min_capacity, max_capacity })
			.eq('id', trainingId);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Egzersiz güncellenirken hata: ' + updateError.message
			});
		}

		return { success: true, message: 'Egzersiz başarıyla güncellendi' };
	},

	deleteTraining: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();
		const trainingId = Number(formData.get('trainingId'));

		if (!trainingId) {
			return fail(400, { success: false, message: 'Egzersiz ID gereklidir' });
		}

		const { error: deleteError } = await supabase
			.from('pe_trainings')
			.delete()
			.eq('id', trainingId);

		if (deleteError) {
			return fail(500, {
				success: false,
				message: 'Egzersiz silinirken hata: ' + deleteError.message
			});
		}

		return { success: true, message: 'Egzersiz başarıyla silindi' };
	}
};
