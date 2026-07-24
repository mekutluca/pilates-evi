import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { Role, TrainerWithEmail } from '$lib/types';
import type { User } from '@supabase/supabase-js';
import { getRequiredFormDataString, formatDateForDB } from '$lib/utils';

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

export const load: PageServerLoad = async ({ locals: { admin }, parent }) => {
	const { trainers } = await parent();

	// Trainer emails live in auth.users; fetch all org users in one call
	// instead of one lookup per trainer.
	const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
	const authUserById = new Map((authUsers?.users ?? []).map((u) => [u.id, u]));

	const trainersWithEmail: TrainerWithEmail[] = trainers.map((trainer) => ({
		...trainer,
		email: authUserById.get(trainer.id)?.email ?? null
	}));

	return { trainers: trainersWithEmail };
};

export const actions: Actions = {
	createTrainer: async ({
		request,
		locals: { supabase, admin, user, userRole, organizationId }
	}) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		if (!organizationId) {
			return fail(400, {
				success: false,
				message: 'Organizasyon bilgisi bulunamadı'
			});
		}

		const formData = await request.formData();

		const name = getRequiredFormDataString(formData, 'name');
		const phone = getRequiredFormDataString(formData, 'phone');
		const email = getRequiredFormDataString(formData, 'email');
		const password = getRequiredFormDataString(formData, 'password');

		// Create user account using Supabase admin API
		const { data: userData, error: createUserError } = await admin.auth.admin.createUser({
			email,
			password,
			// `app` marks the user as pilates-evi's in the shared Supabase project
			// so branded auth email templates can branch on it
			user_metadata: { fullName: name, app: 'pilates-evi' },
			email_confirm: true
		});

		if (createUserError || !userData.user) {
			return fail(500, {
				success: false,
				message: 'Kullanıcı hesabı oluşturulurken hata: ' + createUserError?.message
			});
		}

		// Add user to the organization with trainer role
		const { error: orgUserError } = await admin.from('pe_user_organizations').insert({
			user_id: userData.user.id,
			organization_id: organizationId,
			role: 'pe_trainer'
		});

		if (orgUserError) {
			// If organization user creation fails, clean up the user account
			await admin.auth.admin.deleteUser(userData.user.id);
			return fail(500, {
				success: false,
				message: 'Kullanıcı organizasyona eklenirken hata: ' + orgUserError.message
			});
		}

		// Create trainer in pe_trainers table using auth user id
		const { error: createError } = await supabase.from('pe_trainers').insert({
			id: userData.user.id,
			name,
			phone
		});

		if (createError) {
			// If trainer creation fails, clean up the user account and organization entry
			await admin.from('pe_user_organizations').delete().eq('user_id', userData.user.id);
			await admin.auth.admin.deleteUser(userData.user.id);
			return fail(500, {
				success: false,
				message: 'Eğitmen oluşturulurken hata: ' + createError.message
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

		const trainerId = getRequiredFormDataString(formData, 'trainerId');
		const name = getRequiredFormDataString(formData, 'name');
		const phone = getRequiredFormDataString(formData, 'phone');

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

		return {
			success: true,
			message: 'Eğitmen başarıyla güncellendi'
		};
	},

	archiveTrainer: async ({ request, locals: { supabase, admin, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();
		const trainerId = getRequiredFormDataString(formData, 'trainerId');

		// Check if trainer has future appointments
		const today = formatDateForDB(new Date());
		const { data: futureAppointments, error: checkError } = await supabase
			.from('pe_appointments')
			.select('id')
			.eq('trainer_id', trainerId)
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
					'Bu eğitmenin gelecek randevuları var. Eğitmeni arşivlemeden önce randevuları başka bir eğitmene aktarmalısınız.'
			});
		}

		// Ban the user account for 100 years (effectively indefinite)
		const { error: disableError } = await admin.auth.admin.updateUserById(trainerId, {
			ban_duration: '876000h' // 100 years
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
		const trainerId = getRequiredFormDataString(formData, 'trainerId');

		// Unban the user account
		const { error: enableError } = await admin.auth.admin.updateUserById(trainerId, {
			ban_duration: 'none' // Remove ban
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
		const trainerId = getRequiredFormDataString(formData, 'trainerId');
		const newPassword = getRequiredFormDataString(formData, 'newPassword');

		// Validate password length
		if (newPassword.length < 6) {
			return fail(400, {
				success: false,
				message: 'Şifre en az 6 karakter olmalıdır'
			});
		}

		// Update user password using Supabase admin API
		const { error: updateError } = await admin.auth.admin.updateUserById(trainerId, {
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
