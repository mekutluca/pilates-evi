import { loadEnv } from 'vite';
import type { TestProject } from 'vitest/node';
import { resetDemoStudio, signInDemoAdmin } from './demo-studio';

/** Resets the Demo studio before the run and (unless KEEP_DEMO_STATE=1) after it. */
export default async function setup(project: TestProject) {
	// .env.local and friends, as the app reads them; the shell's own variables win
	const env = { ...loadEnv('test', process.cwd(), ''), ...process.env };
	const { supabase, session, user } = await signInDemoAdmin(env);
	const manifest = await resetDemoStudio(supabase);
	project.provide('demo', { manifest, accessToken: session.access_token, user });

	return async () => {
		if (env.KEEP_DEMO_STATE === '1') return;
		await resetDemoStudio(supabase);
	};
}
