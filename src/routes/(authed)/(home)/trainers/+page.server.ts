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

export const actions: Actions = {
	createTrainer: async ({ request, locals: { supabase, admin, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();

		const name = getRequiredFormDataString(formData, 'name');
		const phone = getRequiredFormDataString(formData, 'phone');
		const email = getRequiredFormDataString(formData, 'email');
		const password = getRequiredFormDataString(formData, 'password');

		// Create user account using Supabase admin API
		const { data: userData, error: createUserError } = await admin.auth.admin.createUser({
			email,
			password,
			user_metadata: { fullName: name },
			email_confirm: true,
			role: 'pe_trainer'
		});

		if (createUserError || !userData.user) {
			return fail(500, {
				success: false,
				message: 'Kullanıcı hesabı oluşturulurken hata: ' + createUserError?.message
			});
		}

		// Create trainer in pe_trainers table
		const { data: trainerData, error: createError } = await supabase
			.from('pe_trainers')
			.insert({
				name,
				phone,
				auth_id: userData.user.id
			})
			.select()
			.single();

		if (createError || !trainerData) {
			// If trainer creation fails, we should clean up the user account
			await admin.auth.admin.deleteUser(userData.user.id);
			return fail(500, {
				success: false,
				message: 'Eğitmen oluşturulurken hata: ' + createError?.message
			});
		}

		return {
			success: true,
			message: 'Eğitmen ve kullanıcı hesabı başarıyla oluşturuldu'
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

	archiveTrainer: async ({ request, locals: { supabase, admin, user, userRole } }) => {
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

		// Get the trainer's auth_id first
		const { data: trainerData, error: trainerError } = await supabase
			.from('pe_trainers')
			.select('auth_id')
			.eq('id', trainerId)
			.single();

		if (trainerError || !trainerData?.auth_id) {
			return fail(500, {
				success: false,
				message: 'Eğitmen bulunamadı'
			});
		}

		// Disable the user account
		const { error: disableError } = await admin.auth.admin.updateUserById(trainerData.auth_id, {
			ban_duration: 'none', // Indefinite ban
			user_metadata: { banned: true }
		});

		if (disableError) {
			return fail(500, {
				success: false,
				message: 'Kullanıcı hesabı devre dışı bırakılırken hata: ' + disableError.message
			});
		}

		// Archive trainer by setting is_active to false
		const { error: archiveError } = await supabase
			.from('pe_trainers')
			.update({ is_active: false })
			.eq('id', trainerId);

		if (archiveError) {
			return fail(500, {
				success: false,
				message: 'Eğitmen arşivlenirken hata: ' + archiveError.message
			});
		}

		return {
			success: true,
			message: 'Eğitmen başarıyla arşivlendi ve kullanıcı hesabı devre dışı bırakıldı'
		};
	},

	restoreTrainer: async ({ request, locals: { supabase, admin, user, userRole } }) => {
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

		// Get the trainer's auth_id first
		const { data: trainerData, error: trainerError } = await supabase
			.from('pe_trainers')
			.select('auth_id')
			.eq('id', trainerId)
			.single();

		if (trainerError || !trainerData?.auth_id) {
			return fail(500, {
				success: false,
				message: 'Eğitmen bulunamadı'
			});
		}

		// Re-enable the user account
		const { error: enableError } = await admin.auth.admin.updateUserById(trainerData.auth_id, {
			ban_duration: '0s', // Remove ban
			user_metadata: { banned: false }
		});

		if (enableError) {
			return fail(500, {
				success: false,
				message: 'Kullanıcı hesabı etkinleştirilirken hata: ' + enableError.message
			});
		}

		// Restore trainer by setting is_active to true
		const { error: restoreError } = await supabase
			.from('pe_trainers')
			.update({ is_active: true })
			.eq('id', trainerId);

		if (restoreError) {
			return fail(500, {
				success: false,
				message: 'Eğitmen geri yüklenirken hata: ' + restoreError.message
			});
		}

		return {
			success: true,
			message: 'Eğitmen başarıyla geri yüklendi ve kullanıcı hesabı etkinleştirildi'
		};
	},

	resetPassword: async ({ request, locals: { admin, user, userRole } }) => {
		// Ensure only admin users can perform this action
		if (!user || userRole !== 'admin') {
			return fail(403, {
				success: false,
				message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
			});
		}

		const formData = await request.formData();
		const trainerId = Number(getRequiredFormDataString(formData, 'trainerId'));
		const newPassword = getRequiredFormDataString(formData, 'newPassword');

		if (isNaN(trainerId)) {
			return fail(400, {
				success: false,
				message: 'Geçersiz eğitmen ID'
			});
		}

		// Validate password length
		if (newPassword.length < 6) {
			return fail(400, {
				success: false,
				message: 'Şifre en az 6 karakter olmalıdır'
			});
		}

		// First get the trainer to find their user_id
		const { data: trainerData, error: trainerError } = await admin
			.from('pe_trainers')
			.select('auth_id')
			.eq('id', trainerId)
			.single();

		if (trainerError || !trainerData?.auth_id) {
			return fail(500, {
				success: false,
				message: 'Eğitmen bulunamadı veya kullanıcı hesabı mevcut değil'
			});
		}

		// Update user password using Supabase admin API
		const { error: updateError } = await admin.auth.admin.updateUserById(trainerData.auth_id, {
			password: newPassword
		});

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Şifre sıfırlanırken hata: ' + updateError.message
			});
		}

		return {
			success: true,
			message: 'Şifre başarıyla sıfırlandı'
		};
	}
};
