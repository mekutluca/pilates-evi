import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getRequiredFormDataString } from '$lib/utils/form-utils';

export const load: PageServerLoad = async ({
	locals: { admin, user, userRole, organizationId }
}) => {
	// Ensure only admin users can access this page
	if (!user || userRole !== 'admin') {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	if (!organizationId) {
		throw error(400, 'Organizasyon bilgisi bulunamadı');
	}

	// Fetch users from pe_user_organizations for the current organization (admin and coordinator roles only)
	const { data: orgUsers, error: usersError } = await admin
		.from('pe_user_organizations')
		.select('user_id, role, created_at')
		.eq('organization_id', organizationId)
		.eq('is_active', true)
		.in('role', ['pe_admin', 'pe_coordinator']);

	if (usersError) {
		throw error(500, 'Kullanıcılar yüklenirken hata oluştu: ' + usersError.message);
	}

	// Fetch all auth users in one call instead of one lookup per member
	const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
	const authUserById = new Map((authUsers?.users ?? []).map((u) => [u.id, u]));

	const users = (orgUsers || []).map((orgUser) => {
		const authUser = authUserById.get(orgUser.user_id);
		return {
			id: orgUser.user_id,
			email: authUser?.email || '',
			fullName: authUser?.user_metadata?.fullName || '',
			role: orgUser.role.replace('pe_', ''),
			created_at: orgUser.created_at,
			last_sign_in_at: authUser?.last_sign_in_at
		};
	});

	return {
		users
	};
};

export const actions: Actions = {
	createUser: async ({ request, locals: { admin, user, userRole, organizationId } }) => {
		// Ensure only admin users can perform this action
		if (!user || userRole !== 'admin') {
			return fail(403, {
				success: false,
				message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
			});
		}

		if (!organizationId) {
			return fail(400, {
				success: false,
				message: 'Organizasyon bilgisi bulunamadı'
			});
		}

		const formData = await request.formData();

		const email = getRequiredFormDataString(formData, 'email');
		const password = getRequiredFormDataString(formData, 'password');
		const fullName = getRequiredFormDataString(formData, 'fullName');
		const role = getRequiredFormDataString(formData, 'role');

		// Validate role
		if (!['admin', 'coordinator'].includes(role)) {
			return fail(400, {
				success: false,
				message: 'Geçersiz rol seçimi'
			});
		}

		// Create user using Supabase admin API
		const { data: userData, error: createError } = await admin.auth.admin.createUser({
			email,
			password,
			user_metadata: { fullName },
			email_confirm: true
		});

		if (createError || !userData.user) {
			return fail(500, {
				success: false,
				message: 'Kullanıcı oluşturulurken hata: ' + createError?.message
			});
		}

		// Add user to the organization with the specified role
		const { error: orgUserError } = await admin.from('pe_user_organizations').insert({
			user_id: userData.user.id,
			organization_id: organizationId,
			role: `pe_${role}`
		});

		if (orgUserError) {
			// If organization user creation fails, clean up the user account
			await admin.auth.admin.deleteUser(userData.user.id);
			return fail(500, {
				success: false,
				message: 'Kullanıcı organizasyona eklenirken hata: ' + orgUserError.message
			});
		}

		return {
			success: true,
			message: 'Kullanıcı başarıyla oluşturuldu'
		};
	},

	updateUser: async ({ request, locals: { admin, user, userRole, organizationId } }) => {
		// Ensure only admin users can perform this action
		if (!user || userRole !== 'admin') {
			return fail(403, {
				success: false,
				message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
			});
		}

		if (!organizationId) {
			return fail(400, {
				success: false,
				message: 'Organizasyon bilgisi bulunamadı'
			});
		}

		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const fullName = formData.get('fullName') as string;
		const role = formData.get('role') as string;

		// Validate required fields
		if (!userId || !fullName || !role) {
			return fail(400, {
				success: false,
				message: 'Tüm alanlar gereklidir'
			});
		}

		// Validate role
		if (!['admin', 'coordinator'].includes(role)) {
			return fail(400, {
				success: false,
				message: 'Geçersiz rol seçimi'
			});
		}

		// Update user metadata in auth
		const { error: updateAuthError } = await admin.auth.admin.updateUserById(userId, {
			user_metadata: { fullName }
		});

		if (updateAuthError) {
			return fail(500, {
				success: false,
				message: 'Kullanıcı bilgileri güncellenirken hata: ' + updateAuthError.message
			});
		}

		// Update role in pe_user_organizations
		const { error: updateRoleError } = await admin
			.from('pe_user_organizations')
			.update({ role: `pe_${role}` })
			.eq('user_id', userId)
			.eq('organization_id', organizationId);

		if (updateRoleError) {
			return fail(500, {
				success: false,
				message: 'Kullanıcı rolü güncellenirken hata: ' + updateRoleError.message
			});
		}

		return {
			success: true,
			message: 'Kullanıcı başarıyla güncellendi'
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
		const userId = formData.get('userId') as string;
		const newPassword = formData.get('newPassword') as string;

		// Validate required fields
		if (!userId || !newPassword) {
			return fail(400, {
				success: false,
				message: 'Kullanıcı ID ve yeni şifre gereklidir'
			});
		}

		// Validate password length
		if (newPassword.length < 6) {
			return fail(400, {
				success: false,
				message: 'Şifre en az 6 karakter olmalıdır'
			});
		}

		// Update user password using Supabase admin API
		const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
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
