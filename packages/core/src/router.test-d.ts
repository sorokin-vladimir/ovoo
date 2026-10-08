import { expectTypeOf, test } from 'vitest';
import {
	type FullPathPattern,
	type Route,
	type RouteParams,
	createRouter,
	int,
	oneOf,
	route,
} from '@ovoo/core';

test('FullPathPattern is the union of every leaf pattern', () => {
	const router = createRouter([
		route({
			path: '/',
			children: [
				route({ path: '/' }),
				route({
					path: '/users',
					children: [route({ path: '/' }), route({ path: '/:id' })],
				}),
			],
		}),
		route({ path: '/about' }),
	]);
	expectTypeOf<FullPathPattern<typeof router>>().toEqualTypeOf<
		'/' | '/users' | '/users/:id' | '/about'
	>();
});

test('a subtree mounted twice contributes a pattern for each place', () => {
	const settings = route({ path: '/settings', children: [route({ path: '/profile' })] });
	const router = createRouter([
		route({ path: '/admin', children: [settings] }),
		route({ path: '/me', children: [settings] }),
	]);
	expectTypeOf<FullPathPattern<typeof router>>().toEqualTypeOf<
		'/admin/settings/profile' | '/me/settings/profile'
	>();
});

test('an empty children list is a leaf, a list of unknown length gives up on literals', () => {
	const built: Route[] = [];
	const router = createRouter([
		route({ path: '/about', children: [] }),
		route({ path: '/docs', children: built }),
	]);
	expectTypeOf<FullPathPattern<typeof router>>().toEqualTypeOf<string>();
	expectTypeOf<'/about'>().toExtend<FullPathPattern<typeof router>>();
	const empty = createRouter([route({ path: '/about', children: [] })]);
	expectTypeOf<FullPathPattern<typeof empty>>().toEqualTypeOf<'/about'>();
});

test('a route constrains only names from its own path', () => {
	expectTypeOf(route({ path: '/users/:id', params: { id: int } }).params.id).toEqualTypeOf(int);
	expectTypeOf(route({ path: '/files/*', params: { '*': int } }).params['*']).toEqualTypeOf(int);
	// @ts-expect-error "id" belongs to the parent's path, not to "/posts"
	route({ path: '/posts', params: { id: int } });
});

test('RouteParams collects constraints along the chain', () => {
	const tab = oneOf('posts', 'likes');
	const router = createRouter([
		route({
			path: '{/:lang}?/users/:id',
			params: { id: int },
			children: [route({ path: '/:tab', params: { tab } }), route({ path: '/files/*' })],
		}),
	]);
	expectTypeOf<RouteParams<typeof router, '{/:lang}?/users/:id/:tab'>>().toEqualTypeOf<{
		id: number;
		tab: 'posts' | 'likes';
		lang?: string;
	}>();
	expectTypeOf<RouteParams<typeof router, '{/:lang}?/users/:id/files/*'>>().toEqualTypeOf<{
		id: number;
		'*': string;
		lang?: string;
	}>();
});
