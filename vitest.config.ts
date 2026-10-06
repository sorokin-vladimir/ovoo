import { fileURLToPath } from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const packages = ['core', 'navigation', 'react'] as const;

// Set OVOO_TS to an older compiler (5.6, 5.9, 6.0) to check the built .d.ts files
// the way a user on that version sees them. Requires a build first.
const consumerTs = process.env['OVOO_TS'];

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

// *.test.ts files run everywhere: Node, Bun, Deno and browsers.
// *.browser.test.ts files need a real browser and run only there.
const testFiles = ['packages/*/src/**/*.test.{ts,tsx}'];
const browserOnlyFiles = ['packages/*/src/**/*.browser.test.{ts,tsx}'];

export default defineConfig({
	resolve: {
		// Test against sources, not dist, so a build is never a prerequisite.
		alias: Object.fromEntries(
			packages.map((name) => [`@ovoo/${name}`, fromRoot(`./packages/${name}/src/index.ts`)]),
		),
	},
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: testFiles,
					exclude: browserOnlyFiles,
				},
			},
			{
				extends: true,
				test: {
					name: 'browser',
					include: testFiles,
					browser: {
						enabled: true,
						headless: true,
						provider: playwright(),
						instances: [
							{ browser: 'chromium' },
							{ browser: 'firefox' },
							{ browser: 'webkit' },
						],
					},
				},
			},
			// One types project per package: each has its own lib and jsx settings.
			...packages.map((name) => ({
				test: {
					name: `types:${name}`,
					root: `./packages/${name}`,
					include: [],
					typecheck: {
						enabled: true,
						include: ['src/**/*.test-d.{ts,tsx}'],
						...(consumerTs === undefined
							? { tsconfig: './tsconfig.json' }
							: {
									tsconfig: './tsconfig.consumer.json',
									checker: fromRoot(
										`./node_modules/typescript-${consumerTs}/bin/tsc`,
									),
								}),
					},
				},
			})),
		],
	},
});
