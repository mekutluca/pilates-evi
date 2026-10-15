#!/usr/bin/env node
// Wipes the Demo studio and seeds the fresh demo data the regression suite runs against
// (pe_reset_demo_data, supabase/migrations/*_pe_demo_reset.sql). Signs in as the Demo
// admin, so it can only ever touch the Demo studio.
// Usage: npm run demo:reset (reads .env.local)
import { resetDemoStudio, signInDemoAdmin } from '../test/regression/demo-studio.ts';

try {
	const { supabase } = await signInDemoAdmin(process.env);
	const manifest = await resetDemoStudio(supabase);
	console.log(
		`Demo studio reset (week of ${manifest.week0}): ${Object.keys(manifest.trainees).length} trainees, ` +
			`${Object.keys(manifest.purchases).length} kayıtlar, ${Object.keys(manifest.groupLessons).length} group lessons.`
	);
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
