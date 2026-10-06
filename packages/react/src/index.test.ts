import { expect, test } from 'vitest';
import * as react from '@ovoo/react';

// Placeholder until the first real module lands; proves the runtime test pipeline.
test('package entry loads', () => {
	expect(react).toBeTypeOf('object');
});
