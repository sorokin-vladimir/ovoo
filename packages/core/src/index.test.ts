import { expect, test } from 'vitest';
import * as core from '@ovoo/core';

// Placeholder until the first real module lands; proves the runtime test pipeline.
test('package entry loads', () => {
	expect(core).toBeTypeOf('object');
});
