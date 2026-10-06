export type Segment =
	| { readonly kind: 'static'; readonly value: string }
	| { readonly kind: 'param'; readonly name: string }
	| { readonly kind: 'wildcard' };

export type Part = Segment | { readonly kind: 'optional'; readonly segments: readonly Segment[] };

export interface PathPattern {
	readonly source: string;
	readonly parts: readonly Part[];
}

export class PathPatternError extends Error {
	override readonly name = 'PathPatternError';
	readonly pattern: string;
	readonly index: number;

	constructor(reason: string, pattern: string, index: number) {
		super(`${reason}\n\n    ${pattern}\n    ${' '.repeat(index)}^`);
		this.pattern = pattern;
		this.index = index;
	}
}

export function parsePathPattern(source: string): PathPattern {
	const parts: Part[] = [];
	if (source === '/') return { source, parts };
	if (source[0] !== '/' && source[0] !== '{') {
		throw new PathPatternError('Path pattern must start with "/"', source, 0);
	}

	const names = new Set<string>();
	let index = 0;

	// Reads one "/segment" starting at the slash; stops before "/", "{", "}" or the end
	const readSegment = (inGroup: boolean): { segment: Segment; optional: boolean } => {
		const slash = index;
		const start = slash + 1;
		index = start;
		while (index < source.length && !'/{}'.includes(source[index] ?? '')) index++;
		const value = source.slice(start, index);

		if (value === '' && index === source.length) {
			throw new PathPatternError(
				'Trailing slash is not allowed; the trailingSlash option decides how such URLs are treated',
				source,
				slash,
			);
		}
		if (value === '') {
			throw new PathPatternError('Empty segment', source, start);
		}
		const optional = value.startsWith(':') && value.endsWith('?');
		if (optional && inGroup) {
			throw new PathPatternError(
				'A path param inside a group is already optional; remove the "?"',
				source,
				index - 1,
			);
		}
		const segment = parseSegment(source, optional ? value.slice(0, -1) : value, start);
		if (segment.kind === 'wildcard' && inGroup) {
			throw new PathPatternError('A wildcard cannot be inside a group', source, start);
		}
		if (segment.kind === 'wildcard' && index < source.length) {
			throw new PathPatternError('A wildcard must be the last segment', source, start);
		}
		if (segment.kind === 'param') {
			if (names.has(segment.name)) {
				throw new PathPatternError(`Duplicate path param "${segment.name}"`, source, start);
			}
			names.add(segment.name);
		}
		return { segment, optional };
	};

	while (index < source.length) {
		if (source[index] === '{') {
			const open = index;
			index++;
			const segments: Segment[] = [];
			while (source[index] === '/') segments.push(readSegment(true).segment);
			if (segments.length === 0) {
				throw new PathPatternError(
					'A group must contain whole segments, each starting with "/"',
					source,
					index,
				);
			}
			if (index === source.length) {
				throw new PathPatternError('Unclosed group', source, open);
			}
			if (source[index] === '{') {
				throw new PathPatternError('Groups cannot be nested', source, index);
			}
			index++;
			if (source[index] !== '?') {
				throw new PathPatternError('A group must be followed by "?"', source, index);
			}
			index++;
			if (index < source.length && source[index] !== '/' && source[index] !== '{') {
				throw new PathPatternError('Expected "/" or "{" after a group', source, index);
			}
			parts.push({ kind: 'optional', segments });
		} else if (source[index] !== '/') {
			throw reservedCharacter(source, index);
		} else {
			const { segment, optional } = readSegment(false);
			parts.push(optional ? { kind: 'optional', segments: [segment] } : segment);
		}
	}
	return { source, parts };
}

function parseSegment(source: string, value: string, start: number): Segment {
	const regexp = value.indexOf('(');
	if (regexp !== -1) {
		throw new PathPatternError(
			'Regular expressions are not supported; declare a param constraint on the Route instead',
			source,
			start + regexp,
		);
	}
	if (value === '*') return { kind: 'wildcard' };
	if (!value.startsWith(':')) {
		const reserved = /[:*+?#\\)]/.exec(value);
		if (reserved) {
			throw reservedCharacter(source, start + reserved.index);
		}
		return { kind: 'static', value };
	}
	const name = value.slice(1);
	if (name === '') {
		throw new PathPatternError('Missing parameter name after ":"', source, start + 1);
	}
	if (!/^[A-Za-z_$]/.test(name)) {
		throw new PathPatternError(
			'Parameter name must start with a letter, "_" or "$"',
			source,
			start + 1,
		);
	}
	const nameLength = /^[\w$]*/.exec(name)?.[0].length ?? 0;
	if (name[nameLength] === '+' || name[nameLength] === '*') {
		throw new PathPatternError(
			'Repeat modifiers are not supported; use a wildcard "*" segment to match the rest of the path',
			source,
			start + 1 + nameLength,
		);
	}
	if (nameLength < name.length) {
		throw new PathPatternError(
			'A path param must take the whole segment; put the rest into its own segment',
			source,
			start + 1 + nameLength,
		);
	}
	return { kind: 'param', name };
}

function reservedCharacter(source: string, index: number): PathPatternError {
	return new PathPatternError(
		`Reserved character "${source[index]}"; path patterns have no escapes, so it cannot appear in static text`,
		source,
		index,
	);
}
