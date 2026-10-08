import { expectTypeOf, test } from 'vitest';
import { type Route, createRouter, int, match, route } from '@ovoo/core';

test('the result narrows by pattern', () => {
	const router = createRouter([
		route({
			path: '/users',
			children: [route({ path: '/' }), route({ path: '/:id', params: { id: int } })],
		}),
	]);
	const found = match(router, '/users/42');
	expectTypeOf(found?.pattern).toEqualTypeOf<'/users' | '/users/:id' | undefined>();
	if (found?.pattern === '/users/:id') {
		expectTypeOf(found.params).toEqualTypeOf<{ id: number }>();
	}
	if (found?.pattern === '/users') {
		// oxlint-disable-next-line typescript/no-generated-empty-object-type
		expectTypeOf(found.params).toEqualTypeOf<{}>();
	}
});

test('a router built from wide types gives a loose result', () => {
	const routes: Route[] = [];
	const found = match(createRouter(routes), '/anything');
	expectTypeOf(found?.pattern).toEqualTypeOf<string | undefined>();
	expectTypeOf(found?.params).toEqualTypeOf<Readonly<Record<string, unknown>> | undefined>();
});
