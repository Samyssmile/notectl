/**
 * SchemaRegistry: central registry for node specs, mark specs,
 * and inline node specs registered by plugins.
 *
 * Model-only — no imports from input/, plugins/, or view/ layers.
 */

import type { InlineNodeSpec } from './InlineNodeSpec.js';
import type { MarkSpec } from './MarkSpec.js';
import type { NodeSpec } from './NodeSpec.js';
import type { ParseRule } from './ParseRule.js';

export class SchemaRegistry {
	private readonly _nodeSpecs = new Map<string, NodeSpec>();
	private readonly _markSpecs = new Map<string, MarkSpec>();
	private readonly _inlineNodeSpecs = new Map<string, InlineNodeSpec>();

	// --- NodeSpec ---

	registerNodeSpec<T extends string>(spec: NodeSpec<T>): void {
		if (this._nodeSpecs.has(spec.type)) {
			throw new Error(`NodeSpec for type "${spec.type}" is already registered.`);
		}
		this._nodeSpecs.set(spec.type, spec);
	}

	getNodeSpec(type: string): NodeSpec | undefined {
		return this._nodeSpecs.get(type);
	}

	removeNodeSpec(type: string): void {
		this._nodeSpecs.delete(type);
	}

	getNodeTypes(): string[] {
		return [...this._nodeSpecs.keys()];
	}

	// --- MarkSpec ---

	registerMarkSpec<T extends string>(spec: MarkSpec<T>): void {
		if (this._markSpecs.has(spec.type)) {
			throw new Error(`MarkSpec for type "${spec.type}" is already registered.`);
		}
		this._markSpecs.set(spec.type, spec);
	}

	getMarkSpec(type: string): MarkSpec | undefined {
		return this._markSpecs.get(type);
	}

	removeMarkSpec(type: string): void {
		this._markSpecs.delete(type);
	}

	getMarkTypes(): string[] {
		return [...this._markSpecs.keys()];
	}

	// --- InlineNodeSpec ---

	registerInlineNodeSpec<T extends string>(spec: InlineNodeSpec<T>): void {
		if (this._inlineNodeSpecs.has(spec.type)) {
			throw new Error(`InlineNodeSpec for type "${spec.type}" is already registered.`);
		}
		this._inlineNodeSpecs.set(spec.type, spec);
	}

	getInlineNodeSpec(type: string): InlineNodeSpec | undefined {
		return this._inlineNodeSpecs.get(type);
	}

	removeInlineNodeSpec(type: string): void {
		this._inlineNodeSpecs.delete(type);
	}

	getInlineNodeTypes(): string[] {
		return [...this._inlineNodeSpecs.keys()];
	}

	// --- Parse Rules & Sanitize Config ---

	/** Returns all NodeSpec parseHTML rules, sorted by priority descending. */
	getBlockParseRules(): readonly { readonly rule: ParseRule; readonly type: string }[] {
		const results: { readonly rule: ParseRule; readonly type: string }[] = [];
		for (const [type, spec] of this._nodeSpecs) {
			if (spec.parseHTML) {
				for (const rule of spec.parseHTML) {
					results.push({ rule, type });
				}
			}
		}
		return results.sort((a, b) => (b.rule.priority ?? 50) - (a.rule.priority ?? 50));
	}

	/** Returns all InlineNodeSpec parseHTML rules, sorted by priority descending. */
	getInlineParseRules(): readonly { readonly rule: ParseRule; readonly type: string }[] {
		const results: { readonly rule: ParseRule; readonly type: string }[] = [];
		for (const [type, spec] of this._inlineNodeSpecs) {
			if (spec.parseHTML) {
				for (const rule of spec.parseHTML) {
					results.push({ rule, type });
				}
			}
		}
		return results.sort((a, b) => (b.rule.priority ?? 50) - (a.rule.priority ?? 50));
	}

	/** Returns all MarkSpec parseHTML rules, sorted by priority descending. */
	getMarkParseRules(): readonly { readonly rule: ParseRule; readonly type: string }[] {
		const results: { readonly rule: ParseRule; readonly type: string }[] = [];
		for (const [type, spec] of this._markSpecs) {
			if (spec.parseHTML) {
				for (const rule of spec.parseHTML) {
					results.push({ rule, type });
				}
			}
		}
		return results.sort((a, b) => (b.rule.priority ?? 50) - (a.rule.priority ?? 50));
	}

	/** Returns all allowed HTML tags from base defaults + all spec sanitize configs. */
	getAllowedTags(): string[] {
		const tags = new Set<string>(['p', 'br', 'div', 'span']);
		for (const spec of this._nodeSpecs.values()) {
			if (spec.sanitize?.tags) {
				for (const tag of spec.sanitize.tags) tags.add(tag);
			}
		}
		for (const spec of this._inlineNodeSpecs.values()) {
			if (spec.sanitize?.tags) {
				for (const tag of spec.sanitize.tags) tags.add(tag);
			}
		}
		for (const spec of this._markSpecs.values()) {
			if (spec.sanitize?.tags) {
				for (const tag of spec.sanitize.tags) tags.add(tag);
			}
		}
		return [...tags];
	}

	/** Returns all allowed HTML attributes from base defaults + all spec sanitize configs. */
	getAllowedAttrs(): string[] {
		const attrs = new Set<string>(['style']);
		for (const spec of this._nodeSpecs.values()) {
			if (spec.sanitize?.attrs) {
				for (const attr of spec.sanitize.attrs) attrs.add(attr);
			}
		}
		for (const spec of this._inlineNodeSpecs.values()) {
			if (spec.sanitize?.attrs) {
				for (const attr of spec.sanitize.attrs) attrs.add(attr);
			}
		}
		for (const spec of this._markSpecs.values()) {
			if (spec.sanitize?.attrs) {
				for (const attr of spec.sanitize.attrs) attrs.add(attr);
			}
		}
		return [...attrs];
	}

	// --- Bulk ---

	clear(): void {
		this._nodeSpecs.clear();
		this._markSpecs.clear();
		this._inlineNodeSpecs.clear();
	}
}
