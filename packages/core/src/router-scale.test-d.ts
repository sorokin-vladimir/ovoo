import { expectTypeOf, test } from 'vitest';
import {
	type FullPathPattern,
	type RouteParams,
	createRouter,
	int,
	oneOf,
	route,
	uuid,
} from '@ovoo/core';

// A tree shaped like a real app, to catch "excessively deep" errors on every supported compiler
test('type inference holds on a realistic route tree', () => {
	const entity = route({
		path: '/:id',
		params: { id: int },
		children: [
			route({ path: '/' }),
			route({ path: '/edit' }),
			route({ path: '/history{/page/:page}?', params: { page: int } }),
			route({ path: '/comments/:commentId', params: { commentId: uuid } }),
		],
	});
	const section = (path: '/users' | '/teams' | '/issues' | '/docs' | '/billing') =>
		route({ path, children: [route({ path: '/' }), route({ path: '/new' }), entity] });

	const attachments = route({ path: '/attachments/*' });
	const card = route({
		path: '/cards/:cardId',
		params: { cardId: int },
		children: [route({ path: '/' }), attachments],
	});
	const board = route({
		path: '/boards/:boardId',
		params: { boardId: int },
		children: [route({ path: '/' }), card],
	});
	const project = route({
		path: '/:projectId',
		params: { projectId: uuid },
		children: [
			route({ path: '/' }),
			route({ path: '/settings/:tab', params: { tab: oneOf('general', 'members') } }),
			board,
		],
	});
	const projects = route({ path: '/projects', children: [route({ path: '/' }), project] });

	const router = createRouter([
		route({
			path: '{/:lang}?',
			params: { lang: oneOf('en', 'de', 'fr') },
			children: [
				route({ path: '/' }),
				route({ path: '/about' }),
				section('/users'),
				section('/teams'),
				section('/issues'),
				section('/docs'),
				section('/billing'),
				projects,
			],
		}),
		route({ path: '/files/*' }),
	]);

	expectTypeOf<'{/:lang}?/projects/:projectId/boards/:boardId/cards/:cardId/attachments/*'>().toExtend<
		FullPathPattern<typeof router>
	>();
	expectTypeOf<
		RouteParams<
			typeof router,
			'{/:lang}?/projects/:projectId/boards/:boardId/cards/:cardId/attachments/*'
		>
	>().toEqualTypeOf<{
		projectId: string;
		boardId: number;
		cardId: number;
		'*': string;
		lang?: 'en' | 'de' | 'fr';
	}>();
	expectTypeOf<
		RouteParams<typeof router, '{/:lang}?/users/:id/history{/page/:page}?'>
	>().toEqualTypeOf<{
		id: number;
		lang?: 'en' | 'de' | 'fr';
		page?: number;
	}>();
});
