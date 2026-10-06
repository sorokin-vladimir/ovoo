import { expectTypeOf, test } from 'vitest';
import {
	type PathParamNames,
	type PathParams,
	type StandardSchemaV1,
	int,
	oneOf,
} from '@ovoo/core';

test('PathParamNames lists every param a pattern declares', () => {
	expectTypeOf<PathParamNames<'{/:lang}?/files/:id/:tab?/*'>>().toEqualTypeOf<
		'lang' | 'id' | 'tab' | '*'
	>();
	expectTypeOf<PathParamNames<'/about'>>().toEqualTypeOf<never>();
});

test('required path params are strings', () => {
	expectTypeOf<PathParams<'/users/:id/posts/:postId'>>().toEqualTypeOf<{
		id: string;
		postId: string;
	}>();
	// A pattern without params has an empty params object
	// oxlint-disable-next-line typescript/no-generated-empty-object-type
	expectTypeOf<PathParams<'/about'>>().toEqualTypeOf<{}>();
	// oxlint-disable-next-line typescript/no-generated-empty-object-type
	expectTypeOf<PathParams<'/'>>().toEqualTypeOf<{}>();
});

test('an optional path param is an optional property', () => {
	expectTypeOf<PathParams<'/books/:id?'>>().toEqualTypeOf<{ id?: string }>();
});

test('a wildcard is a required "*" param', () => {
	expectTypeOf<PathParams<'/files/:bucket/*'>>().toEqualTypeOf<{
		bucket: string;
		'*': string;
	}>();
});

test('path params inside optional groups are optional', () => {
	expectTypeOf<PathParams<'{/:lang}?/docs/:page{/v/:version}?'>>().toEqualTypeOf<{
		page: string;
		lang?: string;
		version?: string;
	}>();
});

test('a pattern known only as string gives a loose record', () => {
	expectTypeOf<PathParams<string>>().toEqualTypeOf<Record<string, string | undefined>>();
});

test('a constraint replaces string with its output type', () => {
	const tab = oneOf('posts', 'likes');
	// Any Standard Schema works, not only the built-ins
	type Slug = StandardSchemaV1<string, `slug-${string}`>;
	expectTypeOf<
		PathParams<'/users/:id/:tab?/:slug', { id: typeof int; tab: typeof tab; slug: Slug }>
	>().toEqualTypeOf<{
		id: number;
		slug: `slug-${string}`;
		tab?: 'posts' | 'likes';
	}>();
});
