import { describe, expect, test } from 'vitest';
import { int, oneOf } from './param-constraints.ts';
import { PathPatternConflictError } from './pattern-set.ts';
import { type Route, compileRoutes, createRouter, route } from './router.ts';

function compileError(routes: readonly Route[]): Error {
	try {
		compileRoutes(routes);
	} catch (error) {
		if (error instanceof Error) return error;
		throw error;
	}
	throw new Error('Expected the route tree to be rejected');
}

describe('compileRoutes', () => {
	test('a single route is a leaf with its own pattern', () => {
		const about = route({ path: '/about' });
		expect(compileRoutes([about]).leaves).toEqual([{ fullPattern: '/about', chain: [about] }]);
	});

	test('child paths append to the parent, and only leaves become entries', () => {
		const user = route({ path: '/:id' });
		const posts = route({ path: '/posts/:postId' });
		const users = route({ path: '/users', children: [user, posts] });
		expect(compileRoutes([users]).leaves).toEqual([
			{ fullPattern: '/users/:id', chain: [users, user] },
			{ fullPattern: '/users/posts/:postId', chain: [users, posts] },
		]);
	});

	test('a "/" path adds no segments, at the root, as an index page or as a grouping route', () => {
		const home = route({ path: '/' });
		const list = route({ path: '/' });
		const settings = route({ path: '/settings' });
		const signedIn = route({ path: '/', children: [settings] });
		const users = route({ path: '/users', children: [list, signedIn] });
		const root = route({ path: '/', children: [home, users] });
		expect(compileRoutes([root]).leaves.map((leaf) => leaf.fullPattern)).toEqual([
			'/',
			'/users',
			'/users/settings',
		]);
	});

	test('a route with an empty children list is a leaf', () => {
		const about = route({ path: '/about', children: [] });
		expect(compileRoutes([about]).leaves).toEqual([{ fullPattern: '/about', chain: [about] }]);
	});

	test('an empty tree compiles to nothing', () => {
		expect(compileRoutes([]).leaves).toEqual([]);
	});

	test('the pattern set matches full patterns with constraints from the whole chain', () => {
		const tab = oneOf('posts', 'likes');
		const user = route({ path: '/:tab', params: { tab } });
		const users = route({ path: '/users/:id', params: { id: int }, children: [user] });
		const { patternSet } = compileRoutes([users]);
		expect(patternSet.match('/users/42/likes')).toEqual({
			pattern: '/users/:id/:tab',
			params: { id: 42, tab: 'likes' },
		});
		expect(patternSet.match('/users/abc/likes')).toBeUndefined();
		expect(patternSet.match('/users/42/about')).toBeUndefined();
	});

	test('a route constrains only the params of its own path', () => {
		// @ts-expect-error types reject it too; this checks the runtime guard for untyped code
		const posts = route({ path: '/posts', params: { id: int } });
		const users = route({ path: '/users/:id', children: [posts] });
		const error = compileError([users]);
		expect(error.message).toBe(
			'In route "/users/:id" > "/posts": Param constraint "id" has no matching path param in "/posts"',
		);
		expect(error.cause).toBeInstanceOf(Error);
	});

	test('a malformed path points at the route and the position in its own path', () => {
		const broken = route({ path: '/:' });
		const users = route({ path: '/users', children: [broken] });
		expect(compileError([users]).message).toBe(
			'In route "/users" > "/:": Missing parameter name after ":"\n\n    /:\n      ^',
		);
	});

	test('a param name repeated along the chain is rejected', () => {
		const user = route({ path: '/:id' });
		const users = route({ path: '/users/:id', children: [user] });
		expect(compileError([users]).message).toContain(
			'In route "/users/:id" > "/:id": Duplicate path param "id"',
		);
	});

	test('a route with a wildcard cannot have children', () => {
		const raw = route({ path: '/raw' });
		const files = route({ path: '/files/*', children: [raw] });
		expect(compileError([files]).message).toBe(
			'In route "/files/*": A route with a wildcard cannot have children',
		);
	});

	test('one subtree can be mounted in several places', () => {
		const profile = route({ path: '/profile' });
		const settings = route({ path: '/settings', children: [profile] });
		const admin = route({ path: '/admin', children: [settings] });
		const me = route({ path: '/me', children: [settings] });
		expect(compileRoutes([admin, me]).leaves).toEqual([
			{ fullPattern: '/admin/settings/profile', chain: [admin, settings, profile] },
			{ fullPattern: '/me/settings/profile', chain: [me, settings, profile] },
		]);
	});

	test('the same route twice under one parent conflicts', () => {
		const about = route({ path: '/about' });
		const root = route({ path: '/', children: [about, about] });
		expect(() => compileRoutes([root])).toThrow(PathPatternConflictError);
	});

	test('compiling never writes into the routes', () => {
		const user = Object.freeze(route({ path: '/:id', params: Object.freeze({ id: int }) }));
		const users = Object.freeze(route({ path: '/users', children: Object.freeze([user]) }));
		expect(() => compileRoutes([users])).not.toThrow();
	});

	test('the pattern set follows the canonical URL options', () => {
		const about = route({ path: '/about' });
		const { patternSet } = compileRoutes([about], { trailingSlash: 'always' });
		expect(patternSet.match('/about')?.redirect).toBe('/about/');
	});
});

describe('createRouter', () => {
	test('reports tree mistakes when the router is created', () => {
		const users = route({ path: '/users/:id', children: [route({ path: '/:id' })] });
		expect(() => createRouter([users])).toThrow('Duplicate path param "id"');
		expect(() =>
			createRouter([route({ path: '/About' }), route({ path: '/about' })], {
				caseSensitive: false,
			}),
		).toThrow(PathPatternConflictError);
	});

	test('an empty tree is a valid router', () => {
		expect(() => createRouter([])).not.toThrow();
	});
});
