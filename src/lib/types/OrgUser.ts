// Staff login accounts (OrgUserService)

export type MemberRole = 'pe_admin' | 'pe_coordinator' | 'pe_trainer';

export interface CreateAccountParams {
	email: string;
	password: string;
	fullName: string;
	role: MemberRole;
}

/**
 * A created account, or an existing login added to the studio (`previousRole`: the role of
 * the removed membership that was reactivated, null when the login is new to the studio).
 */
export type CreateAccountResult =
	| { userId: string; existingLogin: false }
	| { userId: string; existingLogin: true; previousRole: string | null }
	| { error: string };

export type CreatedAccount = Exclude<CreateAccountResult, { error: string }>;

export interface MemberUpdate {
	fullName: string;
	role: MemberRole;
}
