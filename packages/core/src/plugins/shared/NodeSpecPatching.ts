/**
 * Helper for plugins that augment existing block NodeSpecs with an extra
 * attribute rendered as a DOM effect (e.g. alignment's `align`, text
 * direction's `dir`). Re-registers each target spec with the added attribute
 * and a `toDOM` wrapper that applies the effect after the original render.
 */

import type { BlockNode } from '../../model/Document.js';
import type { SchemaRegistry } from '../../model/SchemaRegistry.js';

export interface NodeSpecAttrPatch {
	/** Attribute name to add (skipped for specs that already declare it). */
	readonly attrName: string;
	/** Default value for the attribute, possibly per block type. */
	readonly getDefault: (type: string) => string;
	/** Applies the attribute-derived effect to the rendered element. */
	readonly applyToDOM: (el: HTMLElement, node: BlockNode) => void;
}

/**
 * Adds `patch.attrName` to each of `types` whose NodeSpec does not already
 * declare it, wrapping `toDOM` so `patch.applyToDOM` runs after the original.
 */
export function patchNodeSpecAttr(
	registry: SchemaRegistry,
	types: Iterable<string>,
	patch: NodeSpecAttrPatch,
): void {
	for (const type of types) {
		const spec = registry.getNodeSpec(type);
		if (!spec) continue;
		if (spec.attrs?.[patch.attrName]) continue;

		const originalToDOM = spec.toDOM;

		registry.removeNodeSpec(type);
		registry.registerNodeSpec({
			...spec,
			attrs: {
				...spec.attrs,
				[patch.attrName]: { default: patch.getDefault(type) },
			},
			toDOM(node) {
				const el = originalToDOM.call(spec, node);
				patch.applyToDOM(el, node);
				return el;
			},
		});
	}
}
