/**
 * InputRuleRegistry: manages plugin-registered input rules
 * (pattern-based text transformations triggered on text input).
 */

import type { InputRule } from './InputRule.js';
import type { PluginCallbackRegistration } from './PluginCallbackExecutor.js';

export interface InputRuleEntry {
	readonly rule: InputRule;
	readonly pluginId: string;
	readonly name: string;
}

export class InputRuleRegistry {
	private readonly _inputRules: InputRuleEntry[] = [];

	registerInputRule(rule: InputRule, registration?: PluginCallbackRegistration): void {
		this._inputRules.push({
			rule,
			pluginId: registration?.pluginId ?? 'unattributed',
			name: registration?.name ?? (rule.handler.name || rule.pattern.toString()),
		});
	}

	getInputRules(): readonly InputRule[] {
		return this._inputRules.map((entry) => entry.rule);
	}

	/** Returns input rules with plugin ownership retained for runtime attribution. */
	getInputRuleEntries(): readonly InputRuleEntry[] {
		return this._inputRules;
	}

	removeInputRule(rule: InputRule): void {
		const idx = this._inputRules.findIndex((entry) => entry.rule === rule);
		if (idx !== -1) this._inputRules.splice(idx, 1);
	}

	clear(): void {
		this._inputRules.length = 0;
	}
}
