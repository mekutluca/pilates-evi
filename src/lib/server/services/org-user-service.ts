import { error } from '@sveltejs/kit';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { SupabaseClientType } from '$lib/types/Supabase';
import { requireAdminClient } from '$lib/server/permissions';

export type MemberRole = 'pe_admin' | 'pe_coordinator' | 'pe_trainer';

/**
 * Login accounts of the studio's staff (admins, coordinators, trainers). Every privileged
 * `auth.admin` call goes through here, and every call on an existing account first
 * checks that the account is a member of this studio: the Supabase project is shared with
 * other apps, so a posted user id could otherwise name anyone's account.
 *
 * Membership rows are read and written with the RLS client (admins manage their own
 * studio); only the auth API needs the privileged client.
 */
export class OrgUserService {
	constructor(
		private supabase: SupabaseClientType,
		private admin: SupabaseClientType,
		readonly organizationId: string
	) {}

	/** For the signed-in user's studio; 500s without the secret key, 400s without a studio. */
	static fromLocals(locals: App.Locals): OrgUserService {
		const admin = requireAdminClient(locals.admin);
		if (!locals.organizationId) error(400, 'Organizasyon bilgisi bulunamadı');
		return new OrgUserService(locals.supabase, admin, locals.organizationId);
	}

	/** Auth records of the given members, fetched per id (never a project-wide listing). */
	async getAuthUsers(userIds: string[]): Promise<Map<string, AuthUser>> {
		const results = await Promise.all(userIds.map((id) => this.admin.auth.admin.getUserById(id)));
		const byId = new Map<string, AuthUser>();
		for (const { data } of results) {
			if (data.user) byId.set(data.user.id, data.user);
		}
		return byId;
	}

	/** Creates a login and its membership; the login is removed again if the membership fails. */
	async createAccount(params: {
		email: string;
		password: string;
		fullName: string;
		role: MemberRole;
	}): Promise<{ userId: string } | { error: string }> {
		const { data, error } = await this.admin.auth.admin.createUser({
			email: params.email,
			password: params.password,
			// `app` marks the user as pilates-evi's in the shared Supabase project
			// so branded auth email templates can branch on it
			user_metadata: { fullName: params.fullName, app: 'pilates-evi' },
			email_confirm: true
		});
		if (error || !data.user) {
			return { error: 'Kullanıcı hesabı oluşturulurken hata: ' + error?.message };
		}

		const { error: memberError } = await this.supabase.from('pe_user_organizations').insert({
			user_id: data.user.id,
			organization_id: this.organizationId,
			role: params.role
		});
		if (memberError) {
			await this.admin.auth.admin.deleteUser(data.user.id);
			return { error: 'Kullanıcı stüdyoya eklenirken hata: ' + memberError.message };
		}
		return { userId: data.user.id };
	}

	/** Undoes createAccount when a later step (e.g. the trainer row) fails. */
	async deleteAccount(userId: string): Promise<void> {
		await this.supabase
			.from('pe_user_organizations')
			.delete()
			.eq('user_id', userId)
			.eq('organization_id', this.organizationId);
		await this.admin.auth.admin.deleteUser(userId);
	}

	async updateMember(
		userId: string,
		params: { fullName: string; role: MemberRole }
	): Promise<string | null> {
		const notMember = await this.checkMember(userId);
		if (notMember) return notMember;

		const { error: authError } = await this.admin.auth.admin.updateUserById(userId, {
			user_metadata: { fullName: params.fullName }
		});
		if (authError) return 'Kullanıcı bilgileri güncellenirken hata: ' + authError.message;

		const { error } = await this.supabase
			.from('pe_user_organizations')
			.update({ role: params.role })
			.eq('user_id', userId)
			.eq('organization_id', this.organizationId);
		return error ? 'Kullanıcı rolü güncellenirken hata: ' + error.message : null;
	}

	/**
	 * Removes the user from the studio. The login itself stays (it may belong to another
	 * studio); access ends on the user's next request because roles come from memberships.
	 */
	async deactivateMember(userId: string): Promise<string | null> {
		const { data, error } = await this.supabase
			.from('pe_user_organizations')
			.update({ is_active: false })
			.eq('user_id', userId)
			.eq('organization_id', this.organizationId)
			.select('id');
		if (error) return 'Kullanıcı kaldırılırken hata: ' + error.message;
		return (data ?? []).length === 0 ? 'Kullanıcı bu stüdyoda bulunamadı' : null;
	}

	async resetPassword(userId: string, password: string): Promise<string | null> {
		if (password.length < 6) return 'Şifre en az 6 karakter olmalıdır';
		const notMember = await this.checkMember(userId);
		if (notMember) return notMember;

		const { error } = await this.admin.auth.admin.updateUserById(userId, { password });
		return error ? 'Şifre sıfırlanırken hata: ' + error.message : null;
	}

	/** Blocks or re-allows signing in (archiving and restoring a trainer). */
	async setSignInBlocked(userId: string, blocked: boolean): Promise<string | null> {
		const notMember = await this.checkMember(userId);
		if (notMember) return notMember;

		const { error } = await this.admin.auth.admin.updateUserById(userId, {
			// 100 years: effectively indefinite
			ban_duration: blocked ? '876000h' : 'none'
		});
		return error ? 'Kullanıcı hesabı güncellenirken hata: ' + error.message : null;
	}

	private async checkMember(userId: string): Promise<string | null> {
		const { data } = await this.supabase
			.from('pe_user_organizations')
			.select('id')
			.eq('user_id', userId)
			.eq('organization_id', this.organizationId)
			.maybeSingle();
		return data ? null : 'Kullanıcı bu stüdyoda bulunamadı';
	}
}
