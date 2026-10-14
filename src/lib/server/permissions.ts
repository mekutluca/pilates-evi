import { error, fail } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';
import type { Role } from '$lib/types/Role';
import type { SupabaseClientType } from '$lib/types/Supabase';

const FORBIDDEN_MESSAGE = 'Bu işlemi gerçekleştirmek için yetkiniz yok';

/**
 * Form-action guard: returns a 403 `fail()` when the caller is signed out or
 * lacks one of `roles`, otherwise `null`. Use as
 * `const denied = requireRole(user, userRole, [...]); if (denied) return denied;`
 */
function requireRole(user: User | null, userRole: Role | null, roles: Role[]) {
	if (!user || !userRole || !roles.includes(userRole)) {
		return fail(403, { success: false, message: FORBIDDEN_MESSAGE });
	}
	return null;
}

export function requireStaff(user: User | null, userRole: Role | null) {
	return requireRole(user, userRole, ['admin', 'coordinator']);
}

export function requireAdmin(user: User | null, userRole: Role | null) {
	return requireRole(user, userRole, ['admin']);
}

const NO_ADMIN_CLIENT = 'Kullanıcı yönetimi için sunucu anahtarı tanımlı değil.';

/**
 * Narrows the optional privileged client from `locals.admin`; 500s when
 * PRIVATE_SUPABASE_SECRET_KEY is not configured so the caller can use it
 * unconditionally.
 */
export function requireAdminClient(admin: App.Locals['admin']): SupabaseClientType {
	if (!admin) error(500, NO_ADMIN_CLIENT);
	return admin;
}

/**
 * Form-action guard for actions that hand a posted user id to `auth.admin.*`. The
 * Supabase project is shared with other apps, so the id must be checked against this
 * organization's memberships (read through the RLS client, which only shows the caller's
 * organization) before the privileged client touches the account.
 */
export async function requireOrgMember(supabase: SupabaseClientType, userId: string) {
	const { data } = await supabase
		.from('pe_user_organizations')
		.select('id')
		.eq('user_id', userId)
		.maybeSingle();
	if (!data) {
		return fail(404, { success: false, message: 'Kullanıcı bu stüdyoda bulunamadı' });
	}
	return null;
}
