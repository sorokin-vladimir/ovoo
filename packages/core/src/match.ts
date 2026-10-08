import type { PatternMatch } from './pattern-set.ts';
import {
	type CompiledRoutes,
	type FullPathPattern,
	type Route,
	type RouteParams,
	type Router,
	compiledRoutesOf,
} from './router.ts';

export interface Match {
	readonly pattern: string;
	readonly params: Readonly<Record<string, unknown>>;
	// Routes from the root down to the matched leaf
	readonly chain: readonly Route[];
}

// One member per full pattern, so checking pattern narrows params
export type MatchOf<R extends Router> =
	string extends FullPathPattern<R>
		? Match
		: {
				[Pattern in FullPathPattern<R>]: {
					readonly pattern: Pattern;
					readonly params: RouteParams<R, Pattern>;
					readonly chain: readonly Route[];
				};
			}[FullPathPattern<R>];

// A URL object from any runtime; only the path takes part in matching
export interface UrlLike {
	readonly pathname: string;
	readonly search?: string;
	readonly hash?: string;
}

export interface UrlParts {
	readonly pathname: string;
	readonly search: string;
	readonly hash: string;
}

export function match<R extends Router>(router: R, url: string | UrlLike): MatchOf<R> | null;
export function match(router: Router, url: string | UrlLike): Match | null {
	const { patternSet, chains } = compiledRoutesOf(router);
	const found = patternSet.match(urlParts(url).pathname);
	return found ? matchOf(found, chains) : null;
}

// Internal: a pattern set result with the route chain of its leaf
export function matchOf(found: PatternMatch, chains: CompiledRoutes['chains']): Match {
	return { pattern: found.pattern, params: found.params, chain: chains.get(found.pattern) ?? [] };
}

// Internal: scheme and authority of an absolute URL
export const origin: RegExp = /^[a-z][\d+.a-z-]*:\/\/[^/?#]*/i;

// Internal: splits a URL as written; parsing with URL would normalize the path,
// hiding non-canonical forms
export function urlParts(url: string | UrlLike): UrlParts {
	if (typeof url !== 'string') {
		return { pathname: url.pathname, search: url.search ?? '', hash: url.hash ?? '' };
	}
	const absolute = origin.test(url);
	const rest = url.replace(origin, '');
	const hashAt = rest.indexOf('#');
	const hash = hashAt === -1 ? '' : rest.slice(hashAt);
	const beforeHash = hashAt === -1 ? rest : rest.slice(0, hashAt);
	const searchAt = beforeHash.indexOf('?');
	const search = searchAt === -1 ? '' : beforeHash.slice(searchAt);
	const path = searchAt === -1 ? beforeHash : beforeHash.slice(0, searchAt);
	if (absolute && path === '') return { pathname: '/', search, hash };
	if (!path.startsWith('/')) {
		throw new TypeError(`Expected a path starting with "/" or an absolute URL, got "${url}"`);
	}
	return { pathname: path, search, hash };
}
