import tailwindcss from '@tailwindcss/vite';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import type { ViteUserConfig } from 'vitest/config';

// The studio runs on Turkish time (hooks.server.ts pins the server to it); tests do too
const TZ = 'Europe/Istanbul';

const test: ViteUserConfig['test'] = {
	projects: [
		{
			extends: true,
			test: {
				name: 'unit',
				include: ['src/**/*.test.ts'],
				env: { TZ }
			}
		},
		{
			// Runs the scheduling actions against the Demo studio (.claude/skills/regression-check)
			extends: true,
			test: {
				name: 'regression',
				include: ['test/regression/**/*.test.ts'],
				env: { TZ },
				globalSetup: ['test/regression/global-setup.ts'],
				setupFiles: ['test/regression/setup.ts'],
				// One shared database: files run one after another
				fileParallelism: false,
				testTimeout: 60_000,
				hookTimeout: 120_000
			}
		}
	]
};

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			adapter: adapter(),

			version: { name: process.env.npm_package_version }
		})
	],
	test
});
