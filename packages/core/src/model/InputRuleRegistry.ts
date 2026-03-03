/**
 * InputRuleRegistry: manages plugin-registered input rules
 * (pattern-based text transformations triggered on text input).
 */

import type { InputRule } from './InputRule.js';

export class InputRuleRegistry {
	private readonly _inputRules: InputRule[] = [];

	registerInputRule(rule: InputRule): void {
		this._inputRules.push(rule);
	}

	getInputRules(): readonly InputRule[] {
		return this._inputRules;
	}

	removeInputRule(rule: InputRule): void {
		const idx = this._inputRules.indexOf(rule);
		if (idx !== -1) this._inputRules.splice(idx, 1);
	}

	clear(): void {
		this._inputRules.length = 0;
	}
}
