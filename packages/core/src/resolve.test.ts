import { describe, expect, test } from 'vitest';
import { notFound, redirect } from './outcome.ts';
import { int } from './param-constraints.ts';
import { type ResolveOptions, resolve } from './resolve.ts';
import { createRouter, route } from './router.ts';

// The core lib has no DOM types; every supported runtime has AbortController at run time
type AbortControllerConstructor = new () => {
	readonly signal: NonNullable<ResolveOptions['signal']>;
	abort(reason?: unknown): void;
};
const NativeAbortController =
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	(globalThis as unknown as { AbortController: AbortControllerConstructor }).AbortController;

const user = route({ path: '/:id', params: { id: int } });
const users = route({ path: '/users', children: [user] });

describe('resolve', () => {
	test('wraps what the strategy returns into ok with the match', async () => {
		const router = createRouter([users], { strategy: () => 'user page' });
		expect(await resolve(router, '/users/42')).toEqual({
			type: 'ok',
			value: 'user page',
			match: { pattern: '/users/:id', params: { id: 42 }, chain: [users, user] },
		});
	});

	test('is not found without running the strategy when nothing matches', async () => {
		const calls: unknown[] = [];
		const router = createRouter([users], { strategy: (input) => calls.push(input) });
		expect(await resolve(router, '/users/abc')).toEqual({ type: 'notFound' });
		expect(calls).toEqual([]);
	});

	test('redirects permanently to the canonical URL, keeping query and hash', async () => {
		const calls: unknown[] = [];
		const router = createRouter([users], { strategy: (input) => calls.push(input) });
		expect(await resolve(router, '/users/42/?tab=likes#top')).toEqual({
			type: 'redirect',
			to: '/users/42?tab=likes#top',
			permanent: true,
		});
		expect(calls).toEqual([]);
	});

	test('a redirect thrown by the strategy is the outcome', async () => {
		const router = createRouter([users], {
			strategy: () => {
				throw redirect('/login');
			},
		});
		expect(await resolve(router, '/users/42')).toEqual({
			type: 'redirect',
			to: '/login',
			permanent: false,
		});
	});

	test('a not found thrown by the strategy is the outcome', async () => {
		const router = createRouter([users], {
			strategy: () => {
				throw notFound();
			},
		});
		expect(await resolve(router, '/users/42')).toEqual({ type: 'notFound' });
	});

	test('an outcome returned by the strategy counts the same as a thrown one', async () => {
		const router = createRouter([users], {
			strategy: async () => redirect('/moved', { permanent: true }),
		});
		expect(await resolve(router, '/users/42')).toEqual({
			type: 'redirect',
			to: '/moved',
			permanent: true,
		});
	});

	test('a genuine error rejects unchanged', async () => {
		const failure = new RangeError('database is down');
		const router = createRouter([users], {
			strategy: () => {
				throw failure;
			},
		});
		await expect(resolve(router, '/users/42')).rejects.toBe(failure);
	});

	test('a router without a strategy is a usage error for now', async () => {
		await expect(resolve(createRouter([users]), '/users/42')).rejects.toThrow(
			new TypeError('Expected a router created with a strategy'),
		);
	});

	test('the strategy gets the match, the route chain, the URL parts and the context', async () => {
		const inputs: unknown[] = [];
		const router = createRouter([users], { strategy: (input) => inputs.push(input) });
		const context = { user: 'ann' };
		await resolve(router, 'https://example.com/users/42?tab=likes#top', { context });
		expect(inputs).toMatchObject([
			{
				match: { pattern: '/users/:id', params: { id: 42 }, chain: [users, user] },
				chain: [users, user],
				url: { pathname: '/users/42', search: '?tab=likes', hash: '#top' },
				context,
			},
		]);
	});
});

describe('resolve cancellation', () => {
	test('an already aborted signal rejects with its reason without running the strategy', async () => {
		const calls: unknown[] = [];
		const router = createRouter([users], { strategy: (input) => calls.push(input) });
		const controller = new NativeAbortController();
		const reason = new Error('navigated away');
		controller.abort(reason);
		await expect(resolve(router, '/users/42', { signal: controller.signal })).rejects.toBe(
			reason,
		);
		expect(calls).toEqual([]);
	});

	test('aborting while the strategy runs rejects even when a result arrives later', async () => {
		let finish: ((value: string) => void) | undefined;
		const router = createRouter([users], {
			strategy: () =>
				new Promise<string>((resolvePromise) => {
					finish = resolvePromise;
				}),
		});
		const controller = new NativeAbortController();
		const reason = new Error('navigated away');
		const resolution = resolve(router, '/users/42', { signal: controller.signal });
		controller.abort(reason);
		finish?.('stale page');
		await expect(resolution).rejects.toBe(reason);
	});

	test('aborting wins over an outcome thrown afterwards', async () => {
		let fail: ((outcome: unknown) => void) | undefined;
		const router = createRouter([users], {
			strategy: () =>
				new Promise((_resolvePromise, rejectPromise) => {
					fail = rejectPromise;
				}),
		});
		const controller = new NativeAbortController();
		const reason = new Error('navigated away');
		const resolution = resolve(router, '/users/42', { signal: controller.signal });
		controller.abort(reason);
		fail?.(redirect('/login'));
		await expect(resolution).rejects.toBe(reason);
	});

	test("the strategy's signal is aborted once resolve settles, stopping leftover work", async () => {
		const signals: { readonly aborted: boolean }[] = [];
		const abortedWhileRunning: boolean[] = [];
		const router = createRouter([users], {
			strategy: ({ signal }) => {
				signals.push(signal);
				abortedWhileRunning.push(signal.aborted);
				throw notFound();
			},
		});
		await resolve(router, '/users/42');
		expect(abortedWhileRunning).toEqual([false]);
		expect(signals.map((signal) => signal.aborted)).toEqual([true]);
	});

	test("the caller's abort reaches the strategy's signal with the same reason", async () => {
		const signals: { readonly aborted: boolean; readonly reason: unknown }[] = [];
		let finish: (() => void) | undefined;
		const router = createRouter([users], {
			strategy: ({ signal }) => {
				signals.push(signal);
				return new Promise<void>((resolvePromise) => {
					finish = resolvePromise;
				});
			},
		});
		const controller = new NativeAbortController();
		const reason = new Error('navigated away');
		const resolution = resolve(router, '/users/42', { signal: controller.signal });
		controller.abort(reason);
		expect(signals.map((signal) => [signal.aborted, signal.reason])).toEqual([[true, reason]]);
		finish?.();
		await expect(resolution).rejects.toBe(reason);
	});
});

describe('redirect', () => {
	test('a target that is neither an absolute path nor an absolute URL is a usage error', () => {
		expect(() => redirect('login')).toThrow(
			'Expected a redirect target starting with "/" or an absolute URL, got "login"',
		);
		expect(() => redirect('?page=2')).toThrow(TypeError);
		expect(() => redirect('//evil.example')).toThrow(TypeError);
		expect(() => redirect('/\\evil.example')).toThrow(TypeError);
		expect(redirect('https://example.com/login').to).toBe('https://example.com/login');
	});
});
