import { describe, expect, test } from 'vitest';
import { int, oneOf, uuid } from './param-constraints.ts';
import type { StandardSchemaV1 } from './standard-schema.ts';

function validate(schema: StandardSchemaV1, value: string): StandardSchemaV1.Result<unknown> {
	const result = schema['~standard'].validate(value);
	if (result instanceof Promise) throw new Error('Built-in constraints must be synchronous');
	return result;
}

describe('int', () => {
	test.each([
		['0', 0],
		['42', 42],
		['-7', -7],
		['9007199254740991', 9007199254740991],
	])('accepts %j as %d', (raw, value) => {
		expect(validate(int, raw)).toEqual({ value });
	});

	// Only one spelling per number, so a page never has two URLs.
	test.each(['', 'abc', '4.2', '042', '+1', '-0', '1e3', ' 1', '0x10', '9007199254740992'])(
		'rejects %j',
		(raw) => {
			expect(validate(int, raw).issues).toBeDefined();
		},
	);
});

describe('uuid', () => {
	test.each([
		'0190a6a2-7c3e-7d4f-9b1a-2c3d4e5f6a7b',
		'550E8400-E29B-41D4-A716-446655440000',
		'00000000-0000-0000-0000-000000000000',
	])('accepts %j as is', (raw) => {
		expect(validate(uuid, raw)).toEqual({ value: raw });
	});

	test.each([
		'',
		'550e8400e29b41d4a716446655440000',
		'550e8400-e29b-41d4-a716-44665544000',
		'550e8400-e29b-41d4-a716-4466554400000',
		'g50e8400-e29b-41d4-a716-446655440000',
		'{550e8400-e29b-41d4-a716-446655440000}',
	])('rejects %j', (raw) => {
		expect(validate(uuid, raw).issues).toBeDefined();
	});
});

describe('oneOf', () => {
	const tab = oneOf('overview', 'settings');

	test('accepts only the listed values', () => {
		expect(validate(tab, 'settings')).toEqual({ value: 'settings' });
		expect(validate(tab, 'Settings').issues).toBeDefined();
		expect(validate(tab, 'billing').issues).toBeDefined();
	});
});
