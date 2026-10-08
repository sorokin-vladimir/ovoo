import { describe, expect, test } from 'vitest';
import { match } from './match.ts';
import { int } from './param-constraints.ts';
import { createRouter, route } from './router.ts';

const user = route({ path: '/:id', params: { id: int } });
const userList = route({ path: '/' });
const users = route({ path: '/users', children: [userList, user] });
const router = createRouter([users]);

// The core lib has no DOM types; every supported runtime has URL at run time
type URLConstructor = new (input: string) => { readonly pathname: string };
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const NativeURL = (globalThis as unknown as { URL: URLConstructor }).URL;

describe('match', () => {
	test('returns the full pattern, the params and the route chain', () => {
		expect(match(router, '/users/42')).toEqual({
			pattern: '/users/:id',
			params: { id: 42 },
			chain: [users, user],
		});
	});

	test('query and hash do not take part in matching', () => {
		const expected = match(router, '/users/42');
		expect(match(router, '/users/42?tab=likes#top')).toEqual(expected);
		expect(match(router, '/users/42#a?b')).toEqual(expected);
	});

	test('accepts a URL object or an absolute URL string', () => {
		const expected = match(router, '/users/42');
		const url = new NativeURL('https://example.com/users/42?tab=likes');
		expect(match(router, url)).toEqual(expected);
		expect(match(router, 'https://example.com/users/42?tab=likes')).toEqual(expected);
	});

	test('a relative path is a usage error', () => {
		expect(() => match(router, 'users/42')).toThrow(
			'Expected a path starting with "/" or an absolute URL, got "users/42"',
		);
	});

	test('returns null when no route matches', () => {
		expect(match(router, '/teams')).toBeNull();
		expect(match(router, '/users/abc')).toBeNull();
	});

	test('a non-canonical URL matches like its canonical form, with no redirect', () => {
		expect(match(router, '/users/42/')).toEqual(match(router, '/users/42'));
		expect(match(router, '/%75sers')).toEqual({
			pattern: '/users',
			params: {},
			chain: [users, userList],
		});
	});
});
