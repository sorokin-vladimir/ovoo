import { type Segment, parsePathPattern } from './path-pattern.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';

export type ParamConstraints = Readonly<Record<string, StandardSchemaV1>>;

export type PatternEntry =
	string | { readonly pattern: string; readonly params?: ParamConstraints };

export interface PatternMatch {
	readonly pattern: string;
	readonly params: Readonly<Record<string, unknown>>;
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

export function createPatternSet(entries: readonly PatternEntry[]): PatternSet {
	const variants = entries.flatMap(expand).toSorted(bySpecificity);
	assertNoConflicts(variants);
	return {
		match(path) {
			const segments = path === '/' ? [] : path.split('/').slice(1);
			for (const variant of variants) {
				const params = matchVariant(variant, segments);
				if (params) return { pattern: variant.source, params };
			}
			return undefined;
		},
	};
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
function conflictKey(variant: Variant): string {
	const segments = variant.segments.map(
		(segment) => `${rank(segment)}${segment.kind === 'static' ? `:${segment.value}` : ''}`,
	);
	return `${segments.join('/')}|${variant.omitted}`;
}

function assertNoConflicts(variants: readonly Variant[]): void {
	const seen = new Map<string, Variant>();
	for (const variant of variants) {
		const key = conflictKey(variant);
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

function matchVariant(
	variant: Variant,
	segments: readonly string[],
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
		if (part.kind === 'static' && part.value !== segment) return undefined;
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
