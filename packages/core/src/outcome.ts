import { type Match, type MatchOf, origin } from './match.ts';
import type { Router } from './router.ts';

export interface Ok {
	readonly type: 'ok';
	readonly value: unknown;
	readonly match: Match;
}

export interface Redirect {
	readonly type: 'redirect';
	readonly to: string;
	readonly permanent: boolean;
}

export interface NotFound {
	readonly type: 'notFound';
}

export type Outcome = Ok | Redirect | NotFound;

// Outcome of one router; checking the match's pattern narrows its params
export type OutcomeOf<R extends Router> =
	| { readonly type: 'ok'; readonly value: unknown; readonly match: MatchOf<R> }
	| Redirect
	| NotFound;

// Symbol.for, so outcomes from two copies of the package still recognize each other
const brand = Symbol.for('ovoo.outcome');

// Not enumerable, so an outcome still compares and prints as a plain object
function branded<T extends object>(fields: T): T {
	return Object.freeze(Object.defineProperty(fields, brand, { value: true }));
}

export interface RedirectOptions {
	readonly permanent?: boolean;
}

// "//host" and "/\host" lead to another host in browsers, so they are not paths
const absolutePath = /^\/(?![/\\])/;

export function redirect(to: string, options: RedirectOptions = {}): Redirect {
	if (!absolutePath.test(to) && !origin.test(to)) {
		throw new TypeError(
			`Expected a redirect target starting with "/" or an absolute URL, got "${to}"`,
		);
	}
	return branded<Redirect>({ type: 'redirect', to, permanent: options.permanent ?? false });
}

export function notFound(): NotFound {
	return branded<NotFound>({ type: 'notFound' });
}

// Internal: tells an outcome thrown by a strategy from a genuine error
export function isOutcome(value: unknown): value is Redirect | NotFound {
	return typeof value === 'object' && value !== null && brand in value;
}
