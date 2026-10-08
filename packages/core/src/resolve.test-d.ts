import { expectTypeOf, test } from 'vitest';
import { createRouter, int, resolve, route } from '@ovoo/core';

test('the ok outcome narrows its match by pattern', async () => {
	const router = createRouter(
		[
			route({
				path: '/users',
				children: [route({ path: '/' }), route({ path: '/:id', params: { id: int } })],
			}),
		],
		{ strategy: () => null },
	);
	const outcome = await resolve(router, '/users/42');
	expectTypeOf(outcome.type).toEqualTypeOf<'ok' | 'redirect' | 'notFound'>();
	if (outcome.type === 'ok' && outcome.match.pattern === '/users/:id') {
		expectTypeOf(outcome.match.params).toEqualTypeOf<{ id: number }>();
	}
	if (outcome.type === 'redirect') {
		expectTypeOf(outcome.to).toEqualTypeOf<string>();
		expectTypeOf(outcome.permanent).toEqualTypeOf<boolean>();
	}
});
