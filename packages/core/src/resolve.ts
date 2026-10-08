import { type Match, type UrlLike, type UrlParts, matchOf, urlParts } from './match.ts';
import { type Outcome, type OutcomeOf, isOutcome, notFound, redirect } from './outcome.ts';
import { type Route, type Router, compiledRoutesOf } from './router.ts';

export interface ResolutionInput {
	readonly match: Match;
	// Routes from the root down to the leaf, as the strategy runs them
	readonly chain: readonly Route[];
	readonly url: UrlParts;
	// Aborted when the caller cancels or once resolve settles
	readonly signal: AbortSignalType;
	readonly context: unknown;
}

// What a Route does during Resolution; the Core knows nothing about its steps
export type ResolutionStrategy = (input: ResolutionInput) => unknown;

// The part of AbortSignal the Core relies on
interface SignalLike {
	readonly aborted: boolean;
	readonly reason: unknown;
	throwIfAborted(): void;
}

// The core lib has no DOM types: a user whose lib has AbortSignal gets that type,
// so the signal can go straight into fetch
type AbortSignalType = typeof globalThis extends { AbortSignal: { prototype: infer Signal } }
	? Signal
	: SignalLike;

export interface ResolveOptions {
	// Passed to the strategy as is
	readonly context?: unknown;
	// Aborting it rejects resolve with the signal's reason
	readonly signal?: AbortSignalType;
}

export function resolve<R extends Router>(
	router: R,
	url: string | UrlLike,
	options?: ResolveOptions,
): Promise<OutcomeOf<R>>;
export async function resolve(
	router: Router,
	url: string | UrlLike,
	options: ResolveOptions = {},
): Promise<Outcome> {
	const { patternSet, chains, strategy } = compiledRoutesOf(router);
	const { signal } = options;
	signal?.throwIfAborted();
	const parts = urlParts(url);
	const { pathname, search, hash } = parts;
	const found = patternSet.match(pathname);
	if (!found) return notFound();
	if (found.redirect !== undefined) {
		return redirect(found.redirect + search + hash, { permanent: true });
	}
	const matched = matchOf(found, chains);
	// Until the default strategy exists
	if (strategy === undefined) throw new TypeError('Expected a router created with a strategy');
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const runtime = globalThis as unknown as AbortRuntime;
	// Aborted once resolve settles, so steps still running in parallel stop
	const settled = new runtime.AbortController();
	const strategySignal = signal
		? runtime.AbortSignal.any([signal, settled.signal])
		: settled.signal;
	let value: unknown;
	let failed = false;
	try {
		value = await strategy({
			match: matched,
			chain: matched.chain,
			url: parts,
			signal: strategySignal,
			context: options.context,
		});
	} catch (error) {
		value = error;
		failed = true;
	} finally {
		settled.abort();
	}
	// The caller's abort wins over whatever the strategy ended with
	signal?.throwIfAborted();
	if (isOutcome(value)) return value;
	if (failed) throw value;
	return { type: 'ok', value, match: matched };
}

// Every supported runtime has these; the core lib just does not declare them
interface AbortRuntime {
	readonly AbortController: new () => { readonly signal: SignalLike; abort(): void };
	readonly AbortSignal: { any(signals: readonly SignalLike[]): SignalLike };
}
