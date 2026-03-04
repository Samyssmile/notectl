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
		return this.collectParseRules(this._nodeSpecs);
	}

	/** Returns all InlineNodeSpec parseHTML rules, sorted by priority descending. */
	getInlineParseRules(): readonly { readonly rule: ParseRule; readonly type: string }[] {
		return this.collectParseRules(this._inlineNodeSpecs);
	}

	/** Returns all MarkSpec parseHTML rules, sorted by priority descending. */
	getMarkParseRules(): readonly { readonly rule: ParseRule; readonly type: string }[] {
		return this.collectParseRules(this._markSpecs);
	}

	/** Returns all allowed HTML tags from base defaults + all spec sanitize configs. */
	getAllowedTags(): string[] {
		return [...this.collectSanitizeValues(
			new Set(['p', 'br', 'div', 'span']),
			(spec) => spec.sanitize?.tags,
		)];
	}

	/** Returns all allowed HTML attributes from base defaults + all spec sanitize configs. */
	getAllowedAttrs(): string[] {
		return [...this.collectSanitizeValues(
			new Set(['style', 'dir']),
			(spec) => spec.sanitize?.attrs,
		)];
	}

	private collectParseRules(
		specs: ReadonlyMap<string, { readonly parseHTML?: readonly ParseRule[] }>,
	): { readonly rule: ParseRule; readonly type: string }[] {
		const results: { readonly rule: ParseRule; readonly type: string }[] = [];
		for (const [type, spec] of specs) {
			if (spec.parseHTML) {
				for (const rule of spec.parseHTML) {
					results.push({ rule, type });
				}
			}
		}
		return results.sort((a, b) => (b.rule.priority ?? 50) - (a.rule.priority ?? 50));
	}

	private collectSanitizeValues(
		initial: Set<string>,
		extractor: (spec: { readonly sanitize?: { readonly tags?: readonly string[]; readonly attrs?: readonly string[] } }) => readonly string[] | undefined,
	): Set<string> {
		const allSpecs: ReadonlyMap<string, { readonly sanitize?: { readonly tags?: readonly string[]; readonly attrs?: readonly string[] } }>[] = [
			this._nodeSpecs,
			this._inlineNodeSpecs,
			this._markSpecs,
		];
		for (const specMap of allSpecs) {
			for (const spec of specMap.values()) {
				const values: readonly string[] | undefined = extractor(spec);
				if (values) {
					for (const value of values) initial.add(value);
				}
			}
		}
		return initial;
	}

	// --- Bulk ---

	clear(): void {
		this._nodeSpecs.clear();
		this._markSpecs.clear();
		this._inlineNodeSpecs.clear();
	}
}
