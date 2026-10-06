import { expect, test } from 'vitest';
import * as navigation from '@ovoo/navigation';

// Placeholder until the first real module lands; proves the runtime test pipeline.
test('package entry loads', () => {
	expect(navigation).toBeTypeOf('object');
});
