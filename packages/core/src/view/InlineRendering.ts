/**
 * Shared inline rendering utilities: InlineNode rendering and space preservation.
 *
 * Leaf module with no view-layer dependencies — used by both
 * BlockRendering and DecorationRendering to avoid circular imports.
 */

import type { InlineNode } from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';

/** Renders an InlineNode, using InlineNodeSpec.toDOM() or a fallback element. */
export function renderInlineNode(node: InlineNode, registry?: SchemaRegistry): HTMLElement {
	if (registry) {
		const spec = registry.getInlineNodeSpec(node.inlineType);
		if (spec) {
			const el: HTMLElement = spec.toDOM(node);
			el.setAttribute('contenteditable', 'false');
			return el;
		}
	}
	// Fallback: generic non-editable span
	const el: HTMLElement = document.createElement('span');
	el.setAttribute('data-inline-type', node.inlineType);
	el.setAttribute('contenteditable', 'false');
	return el;
}

/**
 * Converts spaces for contenteditable rendering.
 * Trailing spaces and double spaces are replaced with \u00a0 (non-breaking space)
 * to prevent the browser from collapsing them.
 */
export function preserveSpaces(text: string): string {
	// Replace consecutive spaces: alternate regular and non-breaking
	let result: string = text.replace(/ {2}/g, ' \u00a0');
	// If the text ends with a space, replace it with nbsp
	if (result.endsWith(' ')) {
		result = `${result.slice(0, -1)}\u00a0`;
	}
	// If the text starts with a space, replace it with nbsp
	if (result.startsWith(' ')) {
		result = `\u00a0${result.slice(1)}`;
	}
	return result;
}
