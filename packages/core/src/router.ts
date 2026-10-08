import {
	type ParamConstraints,
	type PatternSet,
	type PatternSetOptions,
	createPatternSet,
} from './pattern-set.ts';
import type { PathParamNames, PathParams } from './path-params.ts';
import { parsePathPattern } from './path-pattern.ts';

export interface Route {
	readonly path: string;
	readonly params?: ParamConstraints;
	readonly children?: readonly Route[];
}

// Turns a constraint on a name the route's own path lacks into a type error
type OwnParamsOnly<R extends Route> = R extends {
	readonly path: infer Path extends string;
	readonly params: infer Params;
}
	? {
			readonly params: {
				[Name in keyof Params]: Name extends PathParamNames<Path> ? Params[Name] : never;
			};
		}
	: unknown;

// Identity at runtime; exists so the literal path and children keep their types
export function route<const R extends Route>(definition: R & OwnParamsOnly<R>): R {
	return definition;
}

export interface CompiledLeaf {
	readonly fullPattern: string;
	// Routes from the root down to this leaf, as the user wrote them
	readonly chain: readonly Route[];
}

export interface CompiledRoutes {
	readonly leaves: readonly CompiledLeaf[];
	// Matches URLs against the leaves' full patterns
	readonly patternSet: PatternSet;
	// Route chain of every leaf by its full pattern, which is unique in a router
	readonly chains: ReadonlyMap<string, readonly Route[]>;
}

export type RouterOptions = PatternSetOptions;

// Type-level twin of joinPatterns
type JoinPatterns<Parent extends string, Child extends string> = Child extends '/'
	? Parent extends ''
		? '/'
		: Parent
	: Parent extends '/'
		? Child
		: `${Parent}${Child}`;

type OwnConstraints<Node> = Node extends { readonly params: infer Params } ? Params : {};

// Leaves under one route with the constraints of their whole chain; a union of routes distributes
type LeafEntries<Node, Parent extends string, Constraints> = Node extends {
	readonly path: infer Path extends string;
}
	? Node extends { readonly children: infer Children extends readonly Route[] }
		? Children extends readonly []
			? {
					pattern: JoinPatterns<Parent, Path>;
					constraints: Constraints & OwnConstraints<Node>;
				}
			: number extends Children['length']
				? // Children built at runtime: their paths are not known to the type system
					{ pattern: string; constraints: {} }
				: LeafEntries<
						Children[number],
						JoinPatterns<Parent, Path>,
						Constraints & OwnConstraints<Node>
					>
		: { pattern: JoinPatterns<Parent, Path>; constraints: Constraints & OwnConstraints<Node> }
	: never;

type RouterLeaves<R extends Router> =
	R extends Router<infer Routes> ? LeafEntries<Routes[number], '', {}> : never;

// Every full path pattern a router matches
export type FullPathPattern<R extends Router> = RouterLeaves<R>['pattern'];

// Path params of one full pattern, typed by the constraints along its chain
export type RouteParams<R extends Router, Pattern extends FullPathPattern<R>> = PathParams<
	Pattern,
	LeafConstraints<RouterLeaves<R>, Pattern>
>;

// A leaf's pattern can be a union when a route's path is (a helper taking several paths),
// so the entry is found by assignability rather than by Extract
type LeafConstraints<Entry, Pattern extends string> = Entry extends {
	pattern: infer Patterns;
	constraints: infer Constraints;
}
	? Pattern extends Patterns
		? Constraints
		: never
	: never;

declare const routeTree: unique symbol;

// Carries the route tree's type for FullPathPattern and RouteParams; nothing is stored under it
export interface Router<Routes extends readonly Route[] = readonly Route[]> {
	readonly [routeTree]?: Routes;
}

// Compiled trees live outside the router object, so it stays an opaque handle;
// match, resolve and href read them through compiledRoutesOf
const compiledRouters = new WeakMap<Router, CompiledRoutes>();

export function createRouter<const Routes extends readonly Route[]>(
	routes: Routes,
	options: RouterOptions = {},
): Router<Routes> {
	const router: Router<Routes> = Object.freeze({});
	compiledRouters.set(router, compileRoutes(routes, options));
	return router;
}

// Internal: what match, resolve and href work from
export function compiledRoutesOf(router: Router): CompiledRoutes {
	const compiled = compiledRouters.get(router);
	if (compiled === undefined) throw new TypeError('Expected a router made by createRouter');
	return compiled;
}

// Prefixes an error with where in the tree it happened, keeping the original as the cause
function inRoute(chain: readonly Route[], check: () => void): void {
	try {
		check();
	} catch (error) {
		const where = chain.map((node) => `"${node.path}"`).join(' > ');
		const reason = error instanceof Error ? error.message : String(error);
		throw new Error(`In route ${where}: ${reason}`, { cause: error });
	}
}

// "/" adds no segments; the root of the tree starts from an empty parent
function joinPatterns(parent: string, child: string): string {
	if (child === '/') return parent === '' ? '/' : parent;
	return parent === '/' ? child : parent + child;
}

export function compileRoutes(
	routes: readonly Route[],
	options: PatternSetOptions = {},
): CompiledRoutes {
	const leaves: CompiledLeaf[] = [];
	const visit = (node: Route, parentPattern: string, parentChain: readonly Route[]): void => {
		const fullPattern = joinPatterns(parentPattern, node.path);
		const chain = [...parentChain, node];
		// Checks the route's own path and that its constraints name only its own params
		inRoute(chain, () => createPatternSet([{ pattern: node.path, params: node.params ?? {} }]));
		if (node.children === undefined || node.children.length === 0) {
			// Some mistakes show only once paths are joined, like a param name used twice
			inRoute(chain, () => parsePathPattern(fullPattern));
			leaves.push({ fullPattern, chain });
			return;
		}
		if (parsePathPattern(node.path).parts.at(-1)?.kind === 'wildcard') {
			inRoute(chain, () => {
				throw new Error('A route with a wildcard cannot have children');
			});
		}
		for (const child of node.children) visit(child, fullPattern, chain);
	};
	for (const node of routes) visit(node, '', []);
	const entries = leaves.map(({ fullPattern, chain }) => ({
		pattern: fullPattern,
		// Each route constrains only its own params, so the chain's constraints never overlap
		params: Object.fromEntries(chain.flatMap((node) => Object.entries(node.params ?? {}))),
	}));
	return {
		leaves,
		patternSet: createPatternSet(entries, options),
		chains: new Map(leaves.map((leaf) => [leaf.fullPattern, leaf.chain])),
	};
}
