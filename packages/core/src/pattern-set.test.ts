import { describe, expect, test } from 'vitest';
import { PathPatternConflictError, createPatternSet } from './pattern-set.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';

describe('match', () => {
	test('returns the matching pattern with its path params', () => {
		const set = createPatternSet(['/users/:id/posts/:postId']);
		expect(set.match('/users/42/posts/7')).toEqual({
			pattern: '/users/:id/posts/:postId',
			params: { id: '42', postId: '7' },
		});
	});

	test('root pattern matches only the root path', () => {
		const set = createPatternSet(['/']);
		expect(set.match('/')).toEqual({ pattern: '/', params: {} });
		expect(set.match('/users')).toBeUndefined();
	});

	test('wildcard captures the rest of the path, slashes included', () => {
		const set = createPatternSet(['/files/*']);
		expect(set.match('/files/a/b.txt')?.params).toEqual({ '*': 'a/b.txt' });
		expect(set.match('/files/')?.params).toEqual({ '*': '' });
		expect(set.match('/files')).toBeUndefined();
	});

	test('optional groups match with or without their segments', () => {
		const set = createPatternSet(['{/:lang}?/docs{/v/:version}?']);
		expect(set.match('/docs')?.params).toEqual({});
		expect(set.match('/en/docs')?.params).toEqual({ lang: 'en' });
		expect(set.match('/docs/v/2')?.params).toEqual({ version: '2' });
		expect(set.match('/en/docs/v/2')?.params).toEqual({ lang: 'en', version: '2' });
		expect(set.match('/docs/v')).toBeUndefined();
	});
});

// Each case lists patterns that all match the URL; the winner must not depend on order
describe('the most specific pattern wins', () => {
	test.each([
		['/users/me', ['/users/:id', '/users/me'], '/users/me'],
		['/files/readme', ['/files/*', '/files/:name'], '/files/:name'],
		['/files/a/b', ['/files/*', '/files/:dir/b'], '/files/:dir/b'],
		['/books/1', ['/books/:id?', '/books/:id'], '/books/:id'],
		['/a/edit', ['/a{/edit}?', '/a/edit'], '/a/edit'],
		['/books', ['/books/:id?', '/books'], '/books'],
		['/docs', ['{/:lang}?/docs', '/docs'], '/docs'],
		['/en/docs', ['{/:lang}?/docs', '/:section/docs'], '/:section/docs'],
	])('%s: %j -> %s', (url, sources, winner) => {
		expect(createPatternSet(sources).match(url)?.pattern).toBe(winner);
		expect(createPatternSet(sources.toReversed()).match(url)?.pattern).toBe(winner);
	});
});

describe('conflicts', () => {
	test('equally specific patterns that match the same URL are rejected', () => {
		const error = conflictError(['/users/:id', '/posts', '/users/:name']);
		expect(error.patterns).toEqual(['/users/:id', '/users/:name']);
		expect(error.message).toContain('"/users/:id" and "/users/:name"');
	});

	test('the same pattern declared twice is rejected', () => {
		expect(conflictError(['/files/*', '/posts', '/files/*']).message).toContain(
			'"/files/*" is declared twice',
		);
	});

	test.each([[['/a/:x?', '/a{/:y}?']]])('%j conflict', (sources) => {
		expect(conflictError(sources).patterns).toHaveLength(2);
	});

	test('a pattern whose optional groups can match a URL in two ways is rejected', () => {
		const error = conflictError(['/a{/:x}?{/:y}?']);
		expect(error.patterns).toEqual(['/a{/:x}?{/:y}?', '/a{/:x}?{/:y}?']);
		expect(error.message).toContain('is ambiguous');
	});

	test.each([[['/users/:id', '/posts/:id']], [['/a/:x', '/a/:x?']], [['/a/b/*', '/a/*']]])(
		'%j do not conflict',
		(sources) => {
			expect(() => createPatternSet(sources)).not.toThrow();
		},
	);
});

describe('param constraints', () => {
	test('a passing constraint replaces the raw value with its output', () => {
		const set = createPatternSet([{ pattern: '/users/:id', params: { id: upperCase } }]);
		expect(set.match('/users/ab')?.params).toEqual({ id: 'AB' });
	});

	test('a failing constraint moves on to the next most specific pattern', () => {
		const set = createPatternSet([
			{ pattern: '/users/:name', params: { name: upperCase } },
			'/users/*',
		]);
		expect(set.match('/users/42')).toEqual({ pattern: '/users/*', params: { '*': '42' } });
		expect(
			createPatternSet([{ pattern: '/users/:name', params: { name: upperCase } }]).match(
				'/users/42',
			),
		).toBeUndefined();
	});

	test('an omitted optional param is not checked', () => {
		const set = createPatternSet([{ pattern: '/books/:id?', params: { id: upperCase } }]);
		expect(set.match('/books')?.params).toEqual({});
		expect(set.match('/books/ab')?.params).toEqual({ id: 'AB' });
	});

	test('an async constraint is an error, since matching is synchronous', () => {
		const async: StandardSchemaV1 = {
			'~standard': { version: 1, vendor: 'test', validate: async (value) => ({ value }) },
		};
		const set = createPatternSet([{ pattern: '/users/:id', params: { id: async } }]);
		expect(() => set.match('/users/1')).toThrow(
			'Param constraint for "id" in "/users/:id" returned a Promise',
		);
	});

	test('a constraint for a param the pattern does not have is rejected', () => {
		expect(() =>
			createPatternSet([{ pattern: '/users/:id', params: { userId: upperCase } }]),
		).toThrow('Param constraint "userId" has no matching path param in "/users/:id"');
		expect(() =>
			createPatternSet([{ pattern: '/users/:id', params: { '*': upperCase } }]),
		).toThrow('Param constraint "*" has no matching path param in "/users/:id"');
	});

	test('a wildcard can be constrained', () => {
		const set = createPatternSet([{ pattern: '/tags/*', params: { '*': upperCase } }]);
		expect(set.match('/tags/news')?.params).toEqual({ '*': 'NEWS' });
		expect(set.match('/tags/a/b')).toBeUndefined();
	});
});

// Minimal Standard Schema: accepts lowercase words and outputs them in upper case
const upperCase: StandardSchemaV1<string, string> = {
	'~standard': {
		version: 1,
		vendor: 'test',
		validate: (value) =>
			typeof value === 'string' && /^[a-z]+$/.test(value)
				? { value: value.toUpperCase() }
				: { issues: [{ message: 'not a lowercase word' }] },
	},
};

function conflictError(sources: readonly string[]): PathPatternConflictError {
	try {
		createPatternSet(sources);
	} catch (error) {
		if (error instanceof PathPatternConflictError) return error;
		throw error;
	}
	throw new Error(`Expected ${JSON.stringify(sources)} to conflict`);
}
