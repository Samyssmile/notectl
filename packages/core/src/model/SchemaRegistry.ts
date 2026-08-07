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
import type { ElementSanitizeValidator } from './SanitizeConfig.js';

/** Priority assigned to parse rules that do not declare an explicit `priority`. */
const DEFAULT_PARSE_PRIORITY = 50;

/** Declarative transformation applied after a target NodeSpec is registered. */
export type NodeSpecExtension = (spec: NodeSpec) => NodeSpec;

export class SchemaRegistry {
	private readonly _nodeSpecs = new Map<string, NodeSpec>();
	private readonly _nodeSpecExtensions = new Map<string, NodeSpecExtension[]>();
	private _finalizedNodeSpecs: Map<string, NodeSpec> | null = null;
	private readonly _markSpecs = new Map<string, MarkSpec>();
	private readonly _inlineNodeSpecs = new Map<string, InlineNodeSpec>();

	// --- NodeSpec ---

	registerNodeSpec<T extends string>(spec: NodeSpec<T>): void {
		if (this._nodeSpecs.has(spec.type)) {
			throw new Error(`NodeSpec for type "${spec.type}" is already registered.`);
		}
		this._nodeSpecs.set(spec.type, spec);
		this.invalidateFinalizedNodeSpecs();
	}

	getNodeSpec(type: string): NodeSpec | undefined {
		return this.getFinalizedNodeSpecs().get(type);
	}

	removeNodeSpec(type: string): void {
		if (this._nodeSpecs.delete(type)) this.invalidateFinalizedNodeSpecs();
	}

	getNodeTypes(): string[] {
		return [...this._nodeSpecs.keys()];
	}

	/**
	 * Registers a composable NodeSpec extension independently of target order.
	 * Extensions may be declared before their target plugin and are materialized
	 * together by {@link finalize}. The function identity is also the cleanup key.
	 */
	registerNodeSpecExtension(type: string, extension: NodeSpecExtension): void {
		const extensions = this._nodeSpecExtensions.get(type) ?? [];
		extensions.push(extension);
		this._nodeSpecExtensions.set(type, extensions);
		this.invalidateFinalizedNodeSpecs();
	}

	/** Removes one previously registered NodeSpec extension by identity. */
	removeNodeSpecExtension(type: string, extension: NodeSpecExtension): void {
		const extensions = this._nodeSpecExtensions.get(type);
		if (!extensions) return;
		const index = extensions.indexOf(extension);
		if (index === -1) return;
		extensions.splice(index, 1);
		if (extensions.length === 0) this._nodeSpecExtensions.delete(type);
		this.invalidateFinalizedNodeSpecs();
	}

	/**
	 * Materializes the complete schema after all plugins have declared their base
	 * specs and extensions. Calling it again after registrations change rebuilds
	 * the snapshot; reads also finalize lazily for standalone registry consumers.
	 */
	finalize(): void {
		const finalized = new Map<string, NodeSpec>();
		for (const [type, baseSpec] of this._nodeSpecs) {
			let resolved: NodeSpec = baseSpec;
			for (const extension of this._nodeSpecExtensions.get(type) ?? []) {
				resolved = extension(resolved);
				if (resolved.type !== type) {
					throw new Error(
						`NodeSpec extension for "${type}" must preserve node type; received "${resolved.type}".`,
					);
				}
			}
			finalized.set(type, resolved);
		}
		this._finalizedNodeSpecs = finalized;
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
		return this.collectParseRules(this.getFinalizedNodeSpecs());
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
		return [
			...this.collectSanitizeValues(
				new Set(['p', 'br', 'div', 'span']),
				(spec) => spec.sanitize?.tags,
			),
		];
	}

	/** Returns all allowed HTML attributes from base defaults + all spec sanitize configs. */
	getAllowedAttrs(): string[] {
		return [
			...this.collectSanitizeValues(
				new Set(['style', 'dir', 'id']),
				(spec) => spec.sanitize?.attrs,
			),
		];
	}

	/** Returns registry-owned, per-tag element validators for one sanitize operation. */
	getElementSanitizeValidators(): ReadonlyMap<string, readonly ElementSanitizeValidator[]> {
		const validators = new Map<string, ElementSanitizeValidator[]>();
		for (const specMap of this.getAllFinalizedSpecMaps()) {
			for (const spec of specMap.values()) {
				for (const [tag, validator] of Object.entries(spec.sanitize?.elementValidators ?? {})) {
					const normalizedTag = tag.toLowerCase();
					const entries = validators.get(normalizedTag) ?? [];
					entries.push(validator);
					validators.set(normalizedTag, entries);
				}
			}
		}
		return validators;
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
		return results.sort(
			(a, b) =>
				(b.rule.priority ?? DEFAULT_PARSE_PRIORITY) - (a.rule.priority ?? DEFAULT_PARSE_PRIORITY),
		);
	}

	private collectSanitizeValues(
		initial: Set<string>,
		extractor: (spec: {
			readonly sanitize?: { readonly tags?: readonly string[]; readonly attrs?: readonly string[] };
		}) => readonly string[] | undefined,
	): Set<string> {
		const allSpecs: readonly ReadonlyMap<
			string,
			{
				readonly sanitize?: {
					readonly tags?: readonly string[];
					readonly attrs?: readonly string[];
				};
			}
		>[] = this.getAllFinalizedSpecMaps();
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

	private getFinalizedNodeSpecs(): ReadonlyMap<string, NodeSpec> {
		if (!this._finalizedNodeSpecs) this.finalize();
		return this._finalizedNodeSpecs ?? new Map();
	}

	private getAllFinalizedSpecMaps(): readonly ReadonlyMap<
		string,
		{
			readonly sanitize?: {
				readonly tags?: readonly string[];
				readonly attrs?: readonly string[];
				readonly elementValidators?: Readonly<Record<string, ElementSanitizeValidator>>;
			};
		}
	>[] {
		return [this.getFinalizedNodeSpecs(), this._inlineNodeSpecs, this._markSpecs];
	}

	private invalidateFinalizedNodeSpecs(): void {
		this._finalizedNodeSpecs = null;
	}

	// --- Bulk ---

	clear(): void {
		this._nodeSpecs.clear();
		this._nodeSpecExtensions.clear();
		this._finalizedNodeSpecs = null;
		this._markSpecs.clear();
		this._inlineNodeSpecs.clear();
	}
}
