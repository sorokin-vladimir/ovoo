import { expectTypeOf, test } from 'vitest';
import type * as react from '@ovoo/react';

// Placeholder until the first real module lands; proves the type test pipeline.
test('package entry has no exports yet', () => {
	expectTypeOf<keyof typeof react>().toEqualTypeOf<never>();
});
