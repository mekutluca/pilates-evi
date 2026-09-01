import { fail } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';
import type { Role } from '$lib/types/Role';

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
