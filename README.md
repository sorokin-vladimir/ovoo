# ovoo

A type-safe isomorphic router. One route tree serves the server and the browser: a URL resolves to whatever the application needs, be it a component, data or a redirect.

> Early development, not published to npm yet. Route trees and path patterns work as described below. Matching a URL against a router (`match`), URL generation, data loading and the React bindings are being built, so parts of the "Why" section describe the design rather than shipped code.

## Why

- The core knows nothing about browser history. The same route tree answers an HTTP request, a link click or a 404 check during SSR, and browser navigation is an optional layer on top.
- Types come from the pattern string. `'/users/:id/:tab?'` gives `{ id: string; tab?: string }` with no code generation, and a constraint like `int` turns `id` into a number.
- The most specific pattern wins, whatever order the routes are declared in. Two patterns that could claim the same URL with equal specificity fail when the router is created.
- All loads of a matched route chain run in parallel.
- Not found and redirects are results you inspect, the same way as a successful match.

ovoo has no built-in data cache, so it sits next to TanStack Query or SWR without overlapping them.

## Packages

| Package            | What it does                                                               |
| ------------------ | -------------------------------------------------------------------------- |
| `@ovoo/core`       | Path patterns, matching, resolution. Runs in Node, Bun, Deno and browsers. |
| `@ovoo/navigation` | Connects the core to browser history through the Navigation API.           |
| `@ovoo/react`      | React bindings with SSR support.                                           |

All packages are ESM only.

## Route tree

A route's path is relative to its parent: a child path starts with a slash and is appended to the parent's, so `/users` and `/:id` give `/users/:id`. A path of `/` adds no segments. That one rule gives you both an index page and a route that only groups its children, for example under a shared guard or layout. Only leaf routes match a URL, so a parent that needs a page of its own gets a `/` child.

```ts
import { createRouter, int, route, type FullPathPattern, type RouteParams } from '@ovoo/core';

const user = route({
	path: '/:id',
	params: { id: int },
	children: [route({ path: '/' }), route({ path: '/edit' })],
});

const router = createRouter([
	route({
		path: '/',
		children: [
			route({ path: '/' }),
			route({ path: '/users', children: [route({ path: '/' }), user] }),
		],
	}),
]);

type Pattern = FullPathPattern<typeof router>;
// '/' | '/users' | '/users/:id' | '/users/:id/edit'

type EditParams = RouteParams<typeof router, '/users/:id/edit'>;
// { id: number }
```

A route constrains only the params of its own path, and the constraints of the whole chain apply to every leaf below it. The router never writes into route objects, so you can freeze them, share them between routers and mount one subtree in several places.

`createRouter` checks the whole tree when it is created: malformed patterns, constraints on names the path does not have, and conflicting routes. Errors say where in the tree the problem is:

```
In route "/users/:id" > "/:id": Duplicate path param "id"

    /users/:id/:id
               ^
```

## Path patterns

The syntax is a strict subset of [URLPattern](https://developer.mozilla.org/docs/Web/API/URL_Pattern_API): every pattern ovoo accepts means the same thing to URLPattern.

| Pattern          | Matches              | Params                 |
| ---------------- | -------------------- | ---------------------- |
| `/users/:id`     | `/users/42`          | `{ id: '42' }`         |
| `/books/:id?`    | `/books`, `/books/7` | `{}`, `{ id: '7' }`    |
| `{/:lang}?/docs` | `/docs`, `/en/docs`  | `{}`, `{ lang: 'en' }` |
| `/files/*`       | `/files/a/b.txt`     | `{ '*': 'a/b.txt' }`   |

A param always takes a whole segment, and a group `{...}?` holds whole segments. There are no inline regular expressions: you constrain a value on the route instead, with the built-in `int`, `uuid` and `oneOf(...)` or with any [Standard Schema](https://standardschema.dev) such as Zod or Valibot. A value that fails its constraint makes the route not match, and the next most specific one gets the URL.

```ts
import { int, oneOf, type PathParams } from '@ovoo/core';

const tab = oneOf('posts', 'likes');

type Params = PathParams<'/users/:id/:tab?', { id: typeof int; tab: typeof tab }>;
// { id: number; tab?: 'posts' | 'likes' }
```

A malformed pattern fails with the position of the problem:

```
A path param must take the whole segment; put the rest into its own segment

    /files/:name.json
                ^
```

### Canonical URLs

Every page has exactly one URL. A request for any other spelling of it matches and carries a redirect to the canonical form: a trailing slash (by policy: `never`, `always` or `ignore`), needless percent-encoding such as `/%75sers`, or a different letter case when matching is case-insensitive. Paths a browser produces on its own are already canonical. Path params are decoded once, and malformed percent-encoding is a plain not found.

## Development

You need Node 24 (see `.nvmrc`) and pnpm.

```sh
pnpm install
pnpm check            # format, lint, typecheck, tests, build, size budgets
pnpm test             # unit and type tests
pnpm test:browser     # Chromium, Firefox and WebKit through Playwright
pnpm size             # min+gzip size of each package against its budget
```

Before the first browser run, install the browsers with `pnpm exec playwright install chromium firefox webkit`.

Type tests (`*.test-d.ts`) also run against the built `.d.ts` files with older compilers, the way a user on that version sees them: `pnpm build && OVOO_TS=5.6 pnpm test:types` (also `5.9` and `6.0`). TypeScript 5.6 is the oldest supported version.

## License

[MIT](LICENSE)
