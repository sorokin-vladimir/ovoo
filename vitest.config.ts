import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packages = ['core', 'navigation', 'react'] as const;

export default defineConfig({
	resolve: {
		// Test against sources, not dist, so a build is never a prerequisite.
		alias: Object.fromEntries(
			packages.map((name) => [
				`@ovoo/${name}`,
				fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url)),
			]),
		),
	},
	test: {
		projects: packages.map((name) => ({
			extends: true,
			test: {
				name,
				root: `./packages/${name}`,
				include: ['src/**/*.test.{ts,tsx}'],
				typecheck: {
					enabled: true,
					include: ['src/**/*.test-d.{ts,tsx}'],
					tsconfig: './tsconfig.json',
				},
			},
		})),
	},
});
