import { describe, expect, it } from 'vitest';
import { pluginHarness } from '../../test/TestUtils.js';
import { FormulaPlugin } from './FormulaPlugin.js';

describe('FormulaPlugin input rule toggle', () => {
	it('registers $...$ / $$...$$ input rules by default', async () => {
		const h = await pluginHarness(new FormulaPlugin());
		expect(h.getInputRules().length).toBeGreaterThanOrEqual(1);
	});

	it('does not register input rules when inputRule is false', async () => {
		const h = await pluginHarness(new FormulaPlugin({ inputRule: false }));
		expect(h.getInputRules().length).toBe(0);
	});
});
