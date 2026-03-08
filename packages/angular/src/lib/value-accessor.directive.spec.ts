import { describe, expect, it } from 'vitest';

import { NotectlValueAccessorDirective } from './value-accessor.directive.js';

describe('NotectlValueAccessorDirective', () => {
	it('remains available as a compatibility shim', () => {
		expect(NotectlValueAccessorDirective).toBeDefined();
		expect(typeof NotectlValueAccessorDirective).toBe('function');
	});
});
