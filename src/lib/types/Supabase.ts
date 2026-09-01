import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/database.types';

// Typed Supabase client shared by utils and services.
export type SupabaseClientType = SupabaseClient<Database>;
