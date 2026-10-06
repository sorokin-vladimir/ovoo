import { expectTypeOf, test } from 'vitest';
import { type StandardSchemaV1, int, oneOf, uuid } from '@ovoo/core';

test('built-in constraints expose their output type', () => {
	expectTypeOf<StandardSchemaV1.InferOutput<typeof int>>().toEqualTypeOf<number>();
	expectTypeOf<StandardSchemaV1.InferOutput<typeof uuid>>().toEqualTypeOf<string>();
});

test('oneOf infers a union of literals', () => {
	const tab = oneOf('overview', 'settings');
	expectTypeOf<StandardSchemaV1.InferOutput<typeof tab>>().toEqualTypeOf<
		'overview' | 'settings'
	>();
});
