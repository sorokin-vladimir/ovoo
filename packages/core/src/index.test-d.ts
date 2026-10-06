import { expectTypeOf, test } from 'vitest';
import type * as core from '@ovoo/core';

// Placeholder until the first real module lands; proves the type test pipeline.
test('package entry has no exports yet', () => {
	expectTypeOf<keyof typeof core>().toEqualTypeOf<never>();
});
