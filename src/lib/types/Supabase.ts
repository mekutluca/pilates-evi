import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

// Typed Supabase client shared by utils and services.
export type SupabaseClientType = SupabaseClient<Database>;

// The error shape Supabase returns (PostgREST, Auth): enough to decide what users see
export interface DbErrorLike {
	code?: string;
	message: string;
}
