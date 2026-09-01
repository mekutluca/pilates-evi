import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';
import type { Role } from '$lib/types/Role.js';
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			supabase: SupabaseClient<Database>;
			safeGetSession: () => Promise<{ session: Session | null; user: User | null }>;
			session: Session | null;
			user: User | null;
			/**
			 * Privileged sessionless client for server-only user management;
			 * undefined when PRIVATE_SUPABASE_SECRET_KEY is not configured.
			 */
			admin: SupabaseClient<Database> | undefined;
			userRole: Role | null;
			organizationId: string | null;
		}
		interface PageData {
			session: Session | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}
export {};
