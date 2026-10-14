import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getRequiredFormDataString } from '$lib/utils/form-utils';
import { requireAdmin } from '$lib/server/permissions';
import { OrgUserService } from '$lib/server/services/org-user-service';
import type { MemberRole } from '$lib/types/OrgUser';

const STAFF_ROLES = new Map<string, MemberRole>([
	['admin', 'pe_admin'],
	['coordinator', 'pe_coordinator']
]);

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || locals.userRole !== 'admin') {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}
	const service = OrgUserService.fromLocals(locals);

	// Admins and coordinators of this studio (trainers are managed on their own page)
	const { data: members, error: membersError } = await locals.supabase
		.from('pe_user_organizations')
		.select('user_id, role, created_at')
		.eq('organization_id', service.organizationId)
		.eq('is_active', true)
		.in('role', ['pe_admin', 'pe_coordinator']);
	if (membersError) {
		throw error(500, 'Kullanıcılar yüklenirken hata oluştu: ' + membersError.message);
	}

	const authUsers = await service.getAuthUsers((members ?? []).map((m) => m.user_id));
	const users = (members ?? []).map((member) => {
		const authUser = authUsers.get(member.user_id);
		return {
			id: member.user_id,
			email: authUser?.email ?? '',
			fullName: authUser?.user_metadata?.fullName ?? '',
			role: member.role.replace('pe_', ''),
			created_at: member.created_at,
			last_sign_in_at: authUser?.last_sign_in_at
		};
	});

	return { users };
};

export const actions: Actions = {
	createUser: async ({ request, locals }) => {
		const denied = requireAdmin(locals.user, locals.userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const role = STAFF_ROLES.get(getRequiredFormDataString(formData, 'role'));
		if (!role) return fail(400, { success: false, message: 'Geçersiz rol seçimi' });

		const result = await OrgUserService.fromLocals(locals).createAccount({
			email: getRequiredFormDataString(formData, 'email'),
			password: getRequiredFormDataString(formData, 'password'),
			fullName: getRequiredFormDataString(formData, 'fullName'),
			role
		});
		if ('error' in result) return fail(500, { success: false, message: result.error });

		return { success: true, message: 'Kullanıcı başarıyla oluşturuldu' };
	},

	updateUser: async ({ request, locals }) => {
		const denied = requireAdmin(locals.user, locals.userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const role = STAFF_ROLES.get(getRequiredFormDataString(formData, 'role'));
		if (!role) return fail(400, { success: false, message: 'Geçersiz rol seçimi' });

		const updateError = await OrgUserService.fromLocals(locals).updateMember(
			getRequiredFormDataString(formData, 'userId'),
			{ fullName: getRequiredFormDataString(formData, 'fullName'), role }
		);
		if (updateError) return fail(400, { success: false, message: updateError });

		return { success: true, message: 'Kullanıcı başarıyla güncellendi' };
	},

	removeUser: async ({ request, locals }) => {
		const denied = requireAdmin(locals.user, locals.userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const userId = getRequiredFormDataString(formData, 'userId');
		if (userId === locals.user?.id) {
			return fail(400, { success: false, message: 'Kendinizi stüdyodan kaldıramazsınız' });
		}

		const removeError = await OrgUserService.fromLocals(locals).deactivateMember(userId);
		if (removeError) return fail(400, { success: false, message: removeError });

		return { success: true, message: 'Kullanıcı stüdyodan kaldırıldı' };
	},

	resetPassword: async ({ request, locals }) => {
		const denied = requireAdmin(locals.user, locals.userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const resetError = await OrgUserService.fromLocals(locals).resetPassword(
			getRequiredFormDataString(formData, 'userId'),
			getRequiredFormDataString(formData, 'newPassword')
		);
		if (resetError) return fail(400, { success: false, message: resetError });

		return { success: true, message: 'Şifre başarıyla sıfırlandı' };
	}
};
