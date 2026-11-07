import { expectTypeOf, test } from 'vitest';
import {
	type FullPathPattern,
	type RouterContext,
	createRouter,
	int,
	notFound,
	redirect,
	resolve,
	route,
	routeWith,
} from '@ovoo/core';

test('ok.value of a tree of loads is the union of the leaves load data, without outcomes', async () => {
	const router = createRouter([
		route({ path: '/about', load: () => ({ title: 'About' }) }),
		route({
			path: '/users',
			children: [
				route({
					path: '/:id',
					load: async ({ params }) => (params.id === '0' ? notFound() : { name: 'Ann' }),
				}),
			],
		}),
		route({ path: '/empty' }),
	]);
	const outcome = await resolve(router, '/about');
	if (outcome.type === 'ok') {
		expectTypeOf(outcome.value).toEqualTypeOf<
			{ title: string } | { name: string } | undefined
		>();
	}
});

test('steps get the route own path params, typed by its constraints', () => {
	route({
		path: '/:id{/:tab}?',
		params: { id: int },
		guard: ({ params }) => {
			expectTypeOf(params).toEqualTypeOf<{ id: number; tab?: string }>();
		},
		load: ({ params }) => {
			expectTypeOf(params).toEqualTypeOf<{ id: number; tab?: string }>();
		},
		render: ({ params }) => {
			expectTypeOf(params).toEqualTypeOf<{ id: number; tab?: string }>();
		},
	});
});

test('a plain route sees an empty context, extended by its own guard', () => {
	route({
		path: '/admin',
		guard: ({ context }) => {
			expectTypeOf(context).toEqualTypeOf<{}>();
			return { user: 'ann' };
		},
		load: ({ context }) => {
			expectTypeOf(context).toEqualTypeOf<{ user: string }>();
		},
		render: ({ context }) => {
			expectTypeOf(context).toEqualTypeOf<{ user: string }>();
		},
	});
});

interface User {
	readonly name: string;
}

const maybeUser = (): { user: User | null } => ({ user: null });

test('routeWith types the context keys and ancestor params a route expects', () => {
	const orgRoute = routeWith<{
		context: { user: User | null; locale: string };
		params: { org: string };
	}>();
	orgRoute({
		path: '/:id',
		guard: ({ context, params }) => {
			expectTypeOf(context).toEqualTypeOf<{ user: User | null; locale: string }>();
			expectTypeOf(params).toEqualTypeOf<{ id: string; org: string }>();
			if (context.user === null) throw redirect('/login');
			return { user: context.user };
		},
		load: ({ context }) => {
			expectTypeOf(context).toEqualTypeOf<{ locale: string; user: User }>();
		},
	});
});

test('createRouter checks that every place a route is mounted gives it the params it expects', () => {
	const members = routeWith<{ params: { org: string } }>()({ path: '/members' });
	const router = createRouter([route({ path: '/orgs/:org', children: [members] })]);
	expectTypeOf<FullPathPattern<typeof router>>().toEqualTypeOf<'/orgs/:org/members'>();
	createRouter([
		route({ path: '/orgs/:org', children: [members] }),
		// @ts-expect-error "/me" gives no "org" param to "/members"
		route({ path: '/me', children: [members] }),
	]);
});

test('resolve requires the context keys that no guard above provides', async () => {
	const profile = routeWith<{ context: { user: User; locale: string } }>()({ path: '/profile' });
	const router = createRouter([
		route({ path: '/me', guard: () => ({ user: { name: 'Ann' } }), children: [profile] }),
	]);
	expectTypeOf<RouterContext<typeof router>>().toEqualTypeOf<{ locale: string }>();
	await resolve(router, '/me/profile', { context: { locale: 'en' } });
	// @ts-expect-error "locale" is not provided by any guard, so resolve must get it
	await resolve(router, '/me/profile');
	// @ts-expect-error "locale" is a string
	await resolve(router, '/me/profile', { context: { locale: 1 } });
	await resolve(createRouter([route({ path: '/' })]), '/');
});

test('createRouter rejects a guard above that provides an expected key of another type', () => {
	const profile = routeWith<{ context: { user: User } }>()({ path: '/profile' });
	const fits = createRouter([
		route({ path: '/me', guard: () => ({ user: { name: 'Ann' } }), children: [profile] }),
	]);
	expectTypeOf<RouterContext<typeof fits>>().toEqualTypeOf<{}>();
	createRouter([
		// @ts-expect-error the guard gives "user" as User | null, "/profile" expects User
		route({ path: '/me', guard: maybeUser, children: [profile] }),
	]);
});

test('render gets its own load data and its children results, and decides ok.value', async () => {
	const router = createRouter([
		route({
			path: '/users',
			load: () => 42,
			render: ({ data, child }) => {
				expectTypeOf(data).toEqualTypeOf<number>();
				expectTypeOf(child).toEqualTypeOf<{ list: true } | { name: string }>();
				return { page: child };
			},
			children: [
				route({ path: '/', render: () => ({ list: true as const }) }),
				route({
					path: '/:id',
					load: () => 'Ann',
					render: (input) => {
						expectTypeOf(input).not.toHaveProperty('child');
						return { name: input.data };
					},
				}),
			],
		}),
	]);
	const outcome = await resolve(router, '/users');
	if (outcome.type === 'ok') {
		expectTypeOf(outcome.value).toEqualTypeOf<{ page: { list: true } | { name: string } }>();
	}
});
