import { error } from '@sveltejs/kit';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { SupabaseClientType } from '$lib/types/Supabase';
import type {
	CreateAccountParams,
	CreateAccountResult,
	CreatedAccount,
	MemberRole,
	MemberUpdate
} from '$lib/types/OrgUser';
import { requireAdminClient } from '$lib/server/permissions';
import { dbErrorMessage, authErrorMessage } from '$lib/server/db-errors';
import { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_ERROR } from '$lib/utils/validation';

// Members the Personel page manages
const STAFF_ROLES: readonly MemberRole[] = ['pe_admin', 'pe_coordinator'];

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
		if (!locals.organizationId) error(400, 'Stüdyo bilgisi bulunamadı');
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

	/**
	 * Adds a person to the studio. A new e-mail gets a login (removed again if the membership
	 * fails). An e-mail that already has a login (removed staff, or someone using another
	 * app on this Supabase project) gets its membership back or a new one; its password is
	 * left alone, since the login may be in use elsewhere.
	 */
	async createAccount(params: CreateAccountParams): Promise<CreateAccountResult> {
		if (params.password.length < MIN_PASSWORD_LENGTH) return { error: PASSWORD_LENGTH_ERROR };
		const { data: existingId, error: lookupError } = await this.admin.rpc('pe_auth_user_id', {
			p_email: params.email
		});
		if (lookupError) {
			return { error: dbErrorMessage(lookupError, 'Hesap kontrol edilemedi. Tekrar deneyin.') };
		}
		if (existingId) return this.addExistingLogin(existingId, params.role);

		const { data, error } = await this.admin.auth.admin.createUser({
			email: params.email,
			password: params.password,
			// `app` marks the user as pilates-evi's in the shared Supabase project
			// so branded auth email templates can branch on it
			user_metadata: { fullName: params.fullName, app: 'pilates-evi' },
			email_confirm: true
		});
		if (error || !data.user) {
			return { error: authErrorMessage(error, 'Hesap oluşturulamadı. Tekrar deneyin.') };
		}

		const { error: memberError } = await this.supabase.from('pe_user_organizations').insert({
			user_id: data.user.id,
			organization_id: this.organizationId,
			role: params.role
		});
		if (memberError) {
			await this.admin.auth.admin.deleteUser(data.user.id);
			return { error: dbErrorMessage(memberError, 'Hesap stüdyoya eklenemedi. Tekrar deneyin.') };
		}
		return { userId: data.user.id, existingLogin: false };
	}

	private async addExistingLogin(userId: string, role: MemberRole): Promise<CreateAccountResult> {
		const { data: membership, error } = await this.supabase
			.from('pe_user_organizations')
			.select('role, is_active')
			.eq('user_id', userId)
			.eq('organization_id', this.organizationId)
			.maybeSingle();
		if (error) return { error: dbErrorMessage(error, 'Hesap kontrol edilemedi. Tekrar deneyin.') };
		if (membership?.is_active) {
			// An archived trainer keeps the membership; only the login is blocked
			return {
				error:
					membership.role === 'pe_trainer'
						? 'Bu e-posta bir eğitmene ait. Arşivdeyse Eğitmenler sayfasında "Arşivlenenleri göster" ile geri yükleyin.'
						: 'Bu e-posta adresiyle kayıtlı biri zaten stüdyoda'
			};
		}

		const { error: writeError } = membership
			? await this.supabase
					.from('pe_user_organizations')
					.update({ role, is_active: true })
					.eq('user_id', userId)
					.eq('organization_id', this.organizationId)
			: await this.supabase
					.from('pe_user_organizations')
					.insert({ user_id: userId, organization_id: this.organizationId, role });
		if (writeError) {
			return { error: dbErrorMessage(writeError, 'Hesap stüdyoya eklenemedi. Tekrar deneyin.') };
		}
		// An archived trainer's login was blocked here; coming back lifts it
		if (membership) {
			const unblockError = await this.setSignInBlocked(userId, false);
			if (unblockError) return { error: unblockError };
		}
		return { userId, existingLogin: true, previousRole: membership?.role ?? null };
	}

	/** Undoes createAccount when a later step (e.g. the trainer row) fails. */
	async undoCreateAccount(account: CreatedAccount): Promise<void> {
		// A reactivated membership goes back to how it was
		if (account.existingLogin && account.previousRole) {
			await this.supabase
				.from('pe_user_organizations')
				.update({ role: account.previousRole, is_active: false })
				.eq('user_id', account.userId)
				.eq('organization_id', this.organizationId);
			return;
		}
		await this.supabase
			.from('pe_user_organizations')
			.delete()
			.eq('user_id', account.userId)
			.eq('organization_id', this.organizationId);
		// Only a login made just now is removed; an existing one may be in use elsewhere
		if (!account.existingLogin) await this.admin.auth.admin.deleteUser(account.userId);
	}

	async updateMember(userId: string, params: MemberUpdate): Promise<string | null> {
		const notStaff = await this.checkMember(userId, true, STAFF_ROLES);
		if (notStaff) return notStaff;

		const { error: authError } = await this.admin.auth.admin.updateUserById(userId, {
			user_metadata: { fullName: params.fullName }
		});
		if (authError) return authErrorMessage(authError, 'Bilgiler kaydedilemedi. Tekrar deneyin.');

		const { error } = await this.supabase
			.from('pe_user_organizations')
			.update({ role: params.role })
			.eq('user_id', userId)
			.eq('organization_id', this.organizationId);
		return error ? dbErrorMessage(error, 'Rol kaydedilemedi. Tekrar deneyin.') : null;
	}

	/**
	 * Removes the user from the studio. The login itself stays (it may belong to another
	 * studio); access ends on the user's next request because roles come from memberships.
	 */
	async deactivateMember(userId: string): Promise<string | null> {
		const notStaff = await this.checkMember(userId, true, STAFF_ROLES);
		if (notStaff) return notStaff;

		const { data, error } = await this.supabase
			.from('pe_user_organizations')
			.update({ is_active: false })
			.eq('user_id', userId)
			.eq('organization_id', this.organizationId)
			.select('id');
		if (error) return dbErrorMessage(error, 'Kişi stüdyodan çıkarılamadı. Tekrar deneyin.');
		return (data ?? []).length === 0 ? 'Kullanıcı bu stüdyoda bulunamadı' : null;
	}

	async resetPassword(userId: string, password: string): Promise<string | null> {
		if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_LENGTH_ERROR;
		const notMember = await this.checkMember(userId);
		if (notMember) return notMember;

		const { error } = await this.admin.auth.admin.updateUserById(userId, { password });
		return error ? authErrorMessage(error, 'Şifre sıfırlanamadı. Tekrar deneyin.') : null;
	}

	/** Blocks or re-allows signing in (archiving and restoring a trainer). */
	async setSignInBlocked(userId: string, blocked: boolean): Promise<string | null> {
		const notMember = await this.checkMember(userId, false);
		if (notMember) return notMember;

		const { error } = await this.admin.auth.admin.updateUserById(userId, {
			// 100 years: effectively indefinite
			ban_duration: blocked ? '876000h' : 'none'
		});
		return error ? authErrorMessage(error, 'Hesap güncellenemedi. Tekrar deneyin.') : null;
	}

	/**
	 * Null when `userId` is a member of this studio (active unless `activeOnly` is false;
	 * removed members keep their row and only blocking may still reach them) holding one of
	 * `roles`; otherwise the message to show. Trainers are managed on their own page, so the
	 * staff page passes STAFF_ROLES.
	 */
	private async checkMember(
		userId: string,
		activeOnly = true,
		roles?: readonly MemberRole[]
	): Promise<string | null> {
		let query = this.supabase
			.from('pe_user_organizations')
			.select('role')
			.eq('user_id', userId)
			.eq('organization_id', this.organizationId);
		if (activeOnly) query = query.eq('is_active', true);
		const { data } = await query.maybeSingle();
		if (!data) return 'Kullanıcı bu stüdyoda bulunamadı';
		if (roles && !roles.some((r) => r === data.role)) {
			return 'Eğitmen hesapları Eğitmenler sayfasından yönetilir';
		}
		return null;
	}
}
