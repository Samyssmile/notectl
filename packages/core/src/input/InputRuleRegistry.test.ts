import { describe, expect, it } from 'vitest';
import type { InputRule } from './InputRule.js';
import { InputRuleRegistry } from './InputRuleRegistry.js';

describe('InputRuleRegistry', () => {
	it('registers and retrieves input rules', () => {
		const registry = new InputRuleRegistry();
		const rule: InputRule = { pattern: /^#\s$/, handler: () => null };
		registry.registerInputRule(rule);
		expect(registry.getInputRules()).toEqual([rule]);
	});

	it('removes an input rule', () => {
		const registry = new InputRuleRegistry();
		const rule: InputRule = { pattern: /^#\s$/, handler: () => null };
		registry.registerInputRule(rule);
		registry.removeInputRule(rule);
		expect(registry.getInputRules()).toEqual([]);
	});

	it('clear removes all rules', () => {
		const registry = new InputRuleRegistry();
		registry.registerInputRule({ pattern: /^#\s$/, handler: () => null });
		registry.registerInputRule({ pattern: /^>\s$/, handler: () => null });
		registry.clear();
		expect(registry.getInputRules()).toEqual([]);
	});
});
