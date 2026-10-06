import type { UserConfig } from 'tsdown';

// Shared build settings for every published package.
export const base: UserConfig = {
	entry: 'src/index.ts',
	format: 'esm',
	platform: 'neutral',
	target: 'es2023',
	unbundle: true,
	dts: true,
	publint: true,
	attw: { profile: 'esm-only' },
};
