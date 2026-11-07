import { describe, expect, test } from 'vitest';
import { notFound, redirect } from './outcome.ts';
import { resolve } from './resolve.ts';
import { route } from './route.ts';
import { createRouter } from './router.ts';

describe('loaders', () => {
	test('is the default strategy: a leaf without render resolves to its load data', async () => {
		const router = createRouter([route({ path: '/about', load: () => ({ title: 'About' }) })]);
		const outcome = await resolve(router, '/about');
		expect(outcome.type === 'ok' && outcome.value).toEqual({ title: 'About' });
	});

	test('render composes from the leaf up, each route with its own data and its child', async () => {
		const router = createRouter([
			route({
				path: '/users',
				load: () => 'Users',
				render: ({ data, child }) => `${data} > ${child}`,
				children: [
					route({
						path: '/:id',
						load: () => 'Ann',
						render: ({ data }) => `<${data}>`,
					}),
				],
			}),
		]);
		const outcome = await resolve(router, '/users/1');
		expect(outcome.type === 'ok' && outcome.value).toBe('Users > <Ann>');
	});

	test('a parent without render passes its child result through', async () => {
		const router = createRouter([
			route({
				path: '/users',
				load: () => 'Users',
				children: [route({ path: '/:id', render: () => 'user page' })],
			}),
		]);
		const outcome = await resolve(router, '/users/1');
		expect(outcome.type === 'ok' && outcome.value).toBe('user page');
	});

	test('guards run top-down before any load and extend the context of their route and below', async () => {
		const log: unknown[] = [];
		const router = createRouter([
			route({
				path: '/admin',
				guard: async ({ context }) => {
					log.push(['guard /admin', context]);
					await Promise.resolve();
					return { user: 'ann' };
				},
				load: ({ context }) => {
					log.push(['load /admin', context]);
				},
				children: [
					route({
						path: '/users',
						guard: ({ context }) => {
							log.push(['guard /users', context]);
							return { role: 'owner' };
						},
						load: ({ context }) => {
							log.push(['load /users', context]);
						},
					}),
				],
			}),
		]);
		await resolve(router, '/admin/users', { context: { locale: 'en' } });
		expect(log).toEqual([
			['guard /admin', { locale: 'en' }],
			['guard /users', { locale: 'en', user: 'ann' }],
			['load /admin', { locale: 'en', user: 'ann' }],
			['load /users', { locale: 'en', user: 'ann', role: 'owner' }],
		]);
	});

	test('a guard returning nothing leaves the context as it is', async () => {
		const router = createRouter([
			route({ path: '/', guard: () => {}, load: ({ context }) => context }),
		]);
		const outcome = await resolve(router, '/', { context: { locale: 'en' } });
		expect(outcome.type === 'ok' && outcome.value).toEqual({ locale: 'en' });
	});

	test('an outcome returned by a guard ends the resolution before any load', async () => {
		const loaded: string[] = [];
		const router = createRouter([
			route({
				path: '/admin',
				guard: () => redirect('/login'),
				load: () => loaded.push('/admin'),
				children: [route({ path: '/', load: () => loaded.push('/admin/') })],
			}),
		]);
		expect(await resolve(router, '/admin')).toEqual({
			type: 'redirect',
			to: '/login',
			permanent: false,
		});
		expect(loaded).toEqual([]);
	});

	test('an outcome returned by a load ends the resolution', async () => {
		const router = createRouter([
			route({
				path: '/users',
				render: ({ child }) => ({ layout: child }),
				children: [route({ path: '/:id', load: () => notFound() })],
			}),
		]);
		expect(await resolve(router, '/users/1')).toEqual({ type: 'notFound' });
	});

	test('an outcome returned by a render ends the resolution', async () => {
		const router = createRouter([
			route({
				path: '/users',
				render: ({ child }) => ({ layout: child }),
				children: [route({ path: '/:id', render: () => redirect('/users') })],
			}),
		]);
		expect(await resolve(router, '/users/1')).toEqual({
			type: 'redirect',
			to: '/users',
			permanent: false,
		});
	});

	test('the first failing load decides the result and the other loads are aborted', async () => {
		const failure = new Error('offline');
		let parentSignal: { readonly aborted: boolean } | undefined;
		const router = createRouter([
			route({
				path: '/users',
				load: ({ signal }) => {
					parentSignal = signal;
					// Never settles on its own: only the abort can stop it
					return new Promise(() => {});
				},
				children: [
					route({
						path: '/:id',
						load: () => {
							throw failure;
						},
					}),
				],
			}),
		]);
		await expect(resolve(router, '/users/1')).rejects.toBe(failure);
		expect(parentSignal?.aborted).toBe(true);
	});

	test('steps get all params of the match, the context, the URL and the signal', async () => {
		const seen: unknown[] = [];
		const router = createRouter([
			route({
				path: '/orgs/:org',
				children: [
					route({
						path: '/:id',
						load: ({ params, context, url, signal }) => {
							seen.push({
								params,
								context,
								url: url.pathname,
								aborted: signal.aborted,
							});
						},
					}),
				],
			}),
		]);
		await resolve(router, '/orgs/acme/7', { context: { locale: 'en' } });
		expect(seen).toEqual([
			{
				params: { org: 'acme', id: '7' },
				context: { locale: 'en' },
				url: '/orgs/acme/7',
				aborted: false,
			},
		]);
	});
});
