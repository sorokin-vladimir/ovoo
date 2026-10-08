import {
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
}

export function match<R extends Router>(router: R, url: string | UrlLike): MatchOf<R> | null;
export function match(router: Router, url: string | UrlLike): Match | null {
	const { patternSet, chains } = compiledRoutesOf(router);
	const found = patternSet.match(pathOf(url));
	if (!found) return null;
	return { pattern: found.pattern, params: found.params, chain: chains.get(found.pattern) ?? [] };
}

// Scheme and authority of an absolute URL
const origin = /^[a-z][\d+.a-z-]*:\/\/[^/?#]*/i;

// Takes the path as written: parsing with URL would normalize it, hiding non-canonical forms
function pathOf(url: string | UrlLike): string {
	if (typeof url !== 'string') return url.pathname;
	const absolute = origin.test(url);
	const path = url.replace(origin, '').split(/[?#]/, 1)[0] ?? '';
	if (absolute && path === '') return '/';
	if (!path.startsWith('/')) {
		throw new TypeError(`Expected a path starting with "/" or an absolute URL, got "${url}"`);
	}
	return path;
}
