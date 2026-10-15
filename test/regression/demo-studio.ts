// Signing in as the Demo admin and resetting the Demo studio, shared by the regression
// suite's global setup and `npm run demo:reset`. Imports stay type-only (apart from
// supabase-js) so Node can run it with its type stripping.
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/types/database.types';
import type { DemoEnv, DemoManifest } from '../../src/lib/types/Regression';
import type { SupabaseClientType } from '../../src/lib/types/Supabase';

const DEMO_ORGANIZATION_NAME = 'Demo';

function requireEnv(env: DemoEnv, name: string): string {
	const value = env[name];
	if (!value) {
		throw new Error(`${name} is not set. Add it to .env.local (see .env.example).`);
	}
	return value;
}

/**
 * Signs in as the Demo studio's admin, so every query goes through RLS scoped to the Demo
 * studio, exactly like the app. Refuses an account that signs into any other studio.
 */
export async function signInDemoAdmin(env: DemoEnv) {
	const supabase = createClient<Database>(
		requireEnv(env, 'PUBLIC_SUPABASE_URL'),
		requireEnv(env, 'PUBLIC_SUPABASE_ANON_KEY'),
		{ auth: { persistSession: false, autoRefreshToken: false } }
	);
	const { data, error } = await supabase.auth.signInWithPassword({
		email: requireEnv(env, 'DEMO_ADMIN_EMAIL'),
		password: requireEnv(env, 'DEMO_ADMIN_PASSWORD')
	});
	if (error) throw new Error(`Demo admin sign-in failed: ${error.message}`);

	const { data: organization } = await supabase
		.from('pe_organizations')
		.select('name')
		.eq('id', data.user.app_metadata.organization_id)
		.maybeSingle();
	if (organization?.name !== DEMO_ORGANIZATION_NAME) {
		throw new Error(
			`DEMO_ADMIN_EMAIL signs into "${organization?.name ?? '?'}", not the Demo studio. Aborting.`
		);
	}
	return { supabase, session: data.session, user: data.user };
}

/** Wipes the Demo studio and seeds the fixtures; returns their ids. */
export async function resetDemoStudio(supabase: SupabaseClientType): Promise<DemoManifest> {
	const { data, error } = await supabase.rpc('pe_reset_demo_data');
	if (error) throw new Error(`Demo reset failed: ${error.message}`);
	// The RPC returns jsonb; its shape is fixed by the SQL function body.
	return data as DemoManifest;
}
