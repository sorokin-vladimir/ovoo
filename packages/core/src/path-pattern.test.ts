import { describe, expect, test } from 'vitest';
import { PathPatternError, parsePathPattern } from './path-pattern.ts';

function parseError(source: string): PathPatternError {
	try {
		parsePathPattern(source);
	} catch (error) {
		if (error instanceof PathPatternError) return error;
		throw error;
	}
	throw new Error(`Expected "${source}" to be rejected`);
}

describe('parsePathPattern', () => {
	test('root pattern has no parts', () => {
		expect(parsePathPattern('/')).toEqual({ source: '/', parts: [] });
	});

	test('static segments', () => {
		expect(parsePathPattern('/users/settings').parts).toEqual([
			{ kind: 'static', value: 'users' },
			{ kind: 'static', value: 'settings' },
		]);
	});

	test('path param takes the whole segment', () => {
		expect(parsePathPattern('/users/:userId/posts/:$post_2').parts).toEqual([
			{ kind: 'static', value: 'users' },
			{ kind: 'param', name: 'userId' },
			{ kind: 'static', value: 'posts' },
			{ kind: 'param', name: '$post_2' },
		]);
	});

	test('optional path param becomes an optional group', () => {
		expect(parsePathPattern('/books/:id?').parts).toEqual([
			{ kind: 'static', value: 'books' },
			{ kind: 'optional', segments: [{ kind: 'param', name: 'id' }] },
		]);
	});

	test('optional group of whole segments', () => {
		expect(parsePathPattern('{/:lang}?/docs{/v/:version}?').parts).toEqual([
			{ kind: 'optional', segments: [{ kind: 'param', name: 'lang' }] },
			{ kind: 'static', value: 'docs' },
			{
				kind: 'optional',
				segments: [
					{ kind: 'static', value: 'v' },
					{ kind: 'param', name: 'version' },
				],
			},
		]);
	});

	test('wildcard as the last segment', () => {
		expect(parsePathPattern('/files/*').parts).toEqual([
			{ kind: 'static', value: 'files' },
			{ kind: 'wildcard' },
		]);
	});
});

// Not every supported runtime ships URLPattern (Node 22 does not), and the core lib
// has no DOM types, so describe the slice of its API this test needs
type URLPatternConstructor = new (init: { pathname: string }) => {
	test(init: { pathname: string }): boolean;
};
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const NativeURLPattern = (globalThis as { URLPattern?: URLPatternConstructor }).URLPattern;

describe.skipIf(NativeURLPattern === undefined)('strict subset of URLPattern', () => {
	test.each([
		['/', '/'],
		['/users/:id', '/users/42'],
		['/books/:id?', '/books'],
		['{/:lang}?/docs{/v/:version}?', '/en/docs/v/2'],
		['/files/*', '/files/a/b'],
	])('%j is a valid URLPattern matching %j', (source, url) => {
		expect(() => parsePathPattern(source)).not.toThrow();
		expect(new NativeURLPattern!({ pathname: source }).test({ pathname: url })).toBe(true);
	});
});

describe('PathPatternError', () => {
	test('points at the offending character', () => {
		const error = parseError('users');
		expect(error.name).toBe('PathPatternError');
		expect(error.pattern).toBe('users');
		expect(error.index).toBe(0);
		expect(error.message).toBe('Path pattern must start with "/"\n\n    users\n    ^');
	});
});

describe('rejected patterns', () => {
	test.each([
		['', 0, 'must start with "/"'],
		['/users//posts', 7, 'Empty segment'],
		['/users/', 6, 'Trailing slash'],
		['/users/:', 8, 'Missing parameter name'],
		['/users/:1st', 8, 'Parameter name must start with a letter, "_" or "$"'],
		['/files/:name.json', 12, 'A path param must take the whole segment'],
		['/a/:id/b/:id', 9, 'Duplicate path param "id"'],
		['/files/*/raw', 7, 'A wildcard must be the last segment'],
		['/a{/b}/c', 6, 'A group must be followed by "?"'],
		['/a{/b', 2, 'Unclosed group'],
		['/file{.json}?', 6, 'A group must contain whole segments, each starting with "/"'],
		['/a{}?', 3, 'A group must contain whole segments, each starting with "/"'],
		['/a{/b{/c}?}?', 5, 'Groups cannot be nested'],
		['/a{/*}?', 4, 'A wildcard cannot be inside a group'],
		['/a{/:b?}?', 6, 'A path param inside a group is already optional'],
		[
			'/users/:id(\\d+)',
			10,
			'Regular expressions are not supported; declare a param constraint',
		],
		['/docs/:path+', 11, 'Repeat modifiers are not supported; use a wildcard'],
		['/docs/:path*', 11, 'Repeat modifiers are not supported; use a wildcard'],
		['/a:b', 2, 'Reserved character ":"'],
		['/a*', 2, 'Reserved character "*"'],
		['/c++', 2, 'Reserved character "+"'],
		['/a?', 2, 'Reserved character "?"'],
		['/a#b', 2, 'Reserved character "#"'],
		['/a\\:b', 2, 'Reserved character "\\"'],
		['/a)', 2, 'Reserved character ")"'],
		['/a}', 2, 'Reserved character "}"'],
		['/x{/a}?b', 7, 'Expected "/" or "{" after a group'],
	])('%j fails at index %i', (source, index, reason) => {
		const error = parseError(source);
		expect(error.index).toBe(index);
		expect(error.message).toContain(reason);
	});
});
