import { type Segment, parsePathPattern } from './path-pattern.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';

export type ParamConstraints = Readonly<Record<string, StandardSchemaV1>>;

export type PatternEntry =
	string | { readonly pattern: string; readonly params?: ParamConstraints };

export interface PatternMatch {
	readonly pattern: string;
	readonly params: Readonly<Record<string, unknown>>;
	// Set when the requested path is not canonical; pattern and params describe this URL
	readonly redirect?: string;
}

export interface PatternSetOptions {
	// Whether canonical URLs end with a slash; "ignore" accepts both forms without a redirect
	readonly trailingSlash?: 'never' | 'always' | 'ignore';
	// When false, static segments match in any letter case and redirect to the pattern spelling
	readonly caseSensitive?: boolean;
}

export interface PatternSet {
	match(path: string): PatternMatch | undefined;
}

// One concrete shape of a pattern: every optional group either taken or omitted
interface Variant {
	readonly source: string;
	// Position of the source in the list, so identical sources still count as two patterns
	readonly index: number;
	readonly constraints: ParamConstraints;
	readonly segments: readonly VariantSegment[];
	// Number of optional groups left out of this variant
	readonly omitted: number;
}

type VariantSegment = Segment & { readonly optional: boolean };

export class PathPatternConflictError extends Error {
	override readonly name = 'PathPatternConflictError';
	readonly patterns: readonly [string, string];

	constructor(message: string, first: string, second: string) {
		super(message);
		this.patterns = [first, second];
	}
}

export function createPatternSet(
	entries: readonly PatternEntry[],
	{ trailingSlash: policy = 'never', caseSensitive = true }: PatternSetOptions = {},
): PatternSet {
	const variants = entries.flatMap(expand).toSorted(bySpecificity);
	assertNoConflicts(variants, caseSensitive);
	return {
		match(path) {
			const trailingSlash = path.length > 1 && path.endsWith('/');
			const segments = decodeSegments(trailingSlash ? path.slice(0, -1) : path);
			if (!segments) return undefined;
			for (const variant of variants) {
				const params = matchVariant(variant, segments, caseSensitive);
				if (!params) continue;
				const base = canonicalPath(variant, segments);
				const withSlash = policy === 'always' || (policy === 'ignore' && trailingSlash);
				const canonical = withSlash && base !== '/' ? `${base}/` : base;
				return canonical === path
					? { pattern: variant.source, params }
					: { pattern: variant.source, params, redirect: canonical };
			}
			return undefined;
		},
	};
}

// Splits before decoding, so an encoded "/" stays inside its segment
function decodeSegments(path: string): string[] | undefined {
	if (path === '/') return [];
	const raw = path.split('/').slice(1);
	// An empty segment ("//") is never part of a canonical URL
	if (raw.includes('')) return undefined;
	try {
		return raw.map(decodeURIComponent);
	} catch {
		// Malformed percent-encoding: no route can serve this URL
		return undefined;
	}
}

function expand(entry: PatternEntry, index: number): Variant[] {
	const { pattern: source, params: constraints = {} } =
		typeof entry === 'string' ? { pattern: entry } : entry;
	const { parts } = parsePathPattern(source);
	const names = new Set(
		parts
			.flatMap((part) => (part.kind === 'optional' ? part.segments : [part]))
			.flatMap((segment) => {
				if (segment.kind === 'param') return [segment.name];
				return segment.kind === 'wildcard' ? ['*'] : [];
			}),
	);
	for (const name of Object.keys(constraints)) {
		if (!names.has(name)) {
			throw new Error(`Param constraint "${name}" has no matching path param in "${source}"`);
		}
	}

	let variants: Variant[] = [{ source, index, constraints, segments: [], omitted: 0 }];
	for (const part of parts) {
		if (part.kind === 'optional') {
			const taken = part.segments.map((segment) => ({ ...segment, optional: true }));
			variants = variants.flatMap((variant) => [
				{ ...variant, omitted: variant.omitted + 1 },
				{ ...variant, segments: [...variant.segments, ...taken] },
			]);
		} else {
			const segment = { ...part, optional: false };
			variants = variants.map((variant) => ({
				...variant,
				segments: [...variant.segments, segment],
			}));
		}
	}
	return variants;
}

const kindRank = { static: 3, param: 2, wildcard: 1 } as const;

// Kind decides first; between equal kinds a required segment beats an optional one
function rank(segment: VariantSegment): number {
	return kindRank[segment.kind] * 2 + (segment.optional ? 0 : 1);
}

// Most specific first: the first segment that differs in rank decides
function bySpecificity(a: Variant, b: Variant): number {
	const length = Math.min(a.segments.length, b.segments.length);
	for (let i = 0; i < length; i++) {
		const left = a.segments[i];
		const right = b.segments[i];
		if (left && right) {
			const diff = rank(right) - rank(left);
			if (diff !== 0) return diff;
		}
	}
	// Variants of different lengths never match the same URL (a wildcard always differs in
	// rank first), so any fixed rule works here; it keeps the comparator transitive
	if (a.segments.length !== b.segments.length) return b.segments.length - a.segments.length;
	return a.omitted - b.omitted;
}

// Variants with the same key rank equally and accept exactly the same URLs
function conflictKey(variant: Variant, caseSensitive: boolean): string {
	const segments = variant.segments.map((segment) => {
		if (segment.kind !== 'static') return `${rank(segment)}`;
		return `${rank(segment)}:${caseSensitive ? segment.value : segment.value.toLowerCase()}`;
	});
	return `${segments.join('/')}|${variant.omitted}`;
}

function assertNoConflicts(variants: readonly Variant[], caseSensitive: boolean): void {
	const seen = new Map<string, Variant>();
	for (const variant of variants) {
		const key = conflictKey(variant, caseSensitive);
		const other = seen.get(key);
		if (other !== undefined) {
			throw new PathPatternConflictError(
				conflictMessage(other, variant),
				other.source,
				variant.source,
			);
		}
		seen.set(key, variant);
	}
}

function conflictMessage(first: Variant, second: Variant): string {
	if (first.index === second.index) {
		return `Path pattern "${first.source}" is ambiguous: its optional groups can match the same URL in more than one way`;
	}
	if (first.source === second.source) {
		return `Path pattern "${first.source}" is declared twice`;
	}
	return `Path patterns "${first.source}" and "${second.source}" are equally specific and match the same URLs`;
}

// Rebuilds the path a matched variant stands for: static text as the pattern spells it,
// every segment encoded the same way
function canonicalPath(variant: Variant, segments: readonly string[]): string {
	const canonical = segments.map((segment, i) => {
		const part = variant.segments[i];
		return part?.kind === 'static' ? part.value : segment;
	});
	return `/${canonical.map(encodeSegment).join('/')}`;
}

// Characters the WHATWG URL parser leaves as is in a path; everything else is encoded
const unencoded = /^[\w!$&'()*+,\-.:;=@[\]|~]$/;

// Encodes only what a browser would encode, plus "%" and "/" that would change the meaning
function encodeSegment(segment: string): string {
	// Dot segments would be collapsed by the URL parser
	if (segment === '.' || segment === '..') return segment.replaceAll('.', '%2E');
	let encoded = '';
	for (const char of segment) {
		encoded += unencoded.test(char) ? char : encodeURIComponent(char);
	}
	return encoded;
}

function sameText(a: string, b: string, caseSensitive: boolean): boolean {
	return caseSensitive ? a === b : a.toLowerCase() === b.toLowerCase();
}

function matchVariant(
	variant: Variant,
	segments: readonly string[],
	caseSensitive: boolean,
): Record<string, unknown> | undefined {
	const wildcard = variant.segments.at(-1)?.kind === 'wildcard';
	if (
		wildcard
			? segments.length < variant.segments.length
			: segments.length !== variant.segments.length
	) {
		return undefined;
	}
	const params: Record<string, unknown> = {};
	for (const [i, part] of variant.segments.entries()) {
		if (part.kind === 'wildcard') {
			params['*'] = segments.slice(i).join('/');
			break;
		}
		const segment = segments[i] ?? '';
		if (part.kind === 'static' && !sameText(part.value, segment, caseSensitive))
			return undefined;
		if (part.kind === 'param') params[part.name] = segment;
	}
	for (const [name, constraint] of Object.entries(variant.constraints)) {
		if (!(name in params)) continue;
		const result = constraint['~standard'].validate(params[name]);
		if (result instanceof Promise) {
			throw new TypeError(
				`Param constraint for "${name}" in "${variant.source}" returned a Promise; constraints must be synchronous`,
			);
		}
		if (result.issues) return undefined;
		params[name] = result.value;
	}
	return params;
}
