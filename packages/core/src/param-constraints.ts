import type { StandardSchemaV1 } from './standard-schema.ts';

function constraint<Output>(
	parse: (value: string) => StandardSchemaV1.Result<Output>,
): StandardSchemaV1<string, Output> {
	return {
		'~standard': {
			version: 1,
			vendor: 'ovoo',
			validate: (value) =>
				typeof value === 'string'
					? parse(value)
					: { issues: [{ message: 'Expected a string' }] },
		},
	};
}

// A decimal integer within the safe integer range, as a number
export const int: StandardSchemaV1<string, number> = constraint((value) => {
	const number = Number(value);
	return /^(?:0|-?[1-9]\d*)$/.test(value) && Number.isSafeInteger(number)
		? { value: number }
		: { issues: [{ message: 'Expected an integer' }] };
});

// One of the listed strings, typed as their union
export function oneOf<const Values extends readonly [string, ...string[]]>(
	...values: Values
): StandardSchemaV1<string, Values[number]> {
	const allowed: ReadonlySet<string> = new Set(values);
	const isAllowed = (value: string): value is Values[number] => allowed.has(value);
	return constraint((value) =>
		isAllowed(value)
			? { value }
			: { issues: [{ message: `Expected one of: ${values.join(', ')}` }] },
	);
}

// A UUID of any version in either letter case, kept as written
export const uuid: StandardSchemaV1<string, string> = constraint((value) =>
	/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)
		? { value }
		: { issues: [{ message: 'Expected a UUID' }] },
);
