// Staff login accounts (OrgUserService)

export type MemberRole = 'pe_admin' | 'pe_coordinator' | 'pe_trainer';

export interface CreateAccountParams {
	email: string;
	password: string;
	fullName: string;
	role: MemberRole;
}

export type CreateAccountResult = { userId: string } | { error: string };

export interface MemberUpdate {
	fullName: string;
	role: MemberRole;
}
