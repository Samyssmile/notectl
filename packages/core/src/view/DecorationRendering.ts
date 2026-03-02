/**
 * Decoration rendering: inline decorations and node decorations.
 *
 * Handles splitting text content by decoration boundaries and
 * applying CSS classes/styles from decorations to block elements.
 */

import type { DecorationAttrs, InlineDecoration } from '../decorations/Decoration.js';
import type { InlineNode, TextNode } from '../model/Document.js';
import { isInlineNode } from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { BlockId } from '../model/TypeBrands.js';
import { appendStyleText, setStyleText } from '../style/StyleRuntime.js';
import { preserveSpaces, renderInlineNode } from './InlineRendering.js';
import { wrapNodeWithMarks } from './MarkRendering.js';
import type { ReconcileOptions } from './Reconciler.js';

/**
 * Renders inline content with decorations. InlineNodes are width-1 split points
 * rendered as their own elements (not wrapped by decorations).
 *
 * For each child:
 * - TextNode: split by decoration boundaries, render text → marks → decorations
 * - InlineNode: render directly without decoration wrapping
 */
export function renderDecoratedContent(
	container: HTMLElement,
	inlineChildren: readonly (TextNode | InlineNode)[],
	inlineDecos: readonly InlineDecoration[],
	registry?: SchemaRegistry,
): void {
	let globalOffset = 0;

	for (const child of inlineChildren) {
		if (isInlineNode(child)) {
			// InlineNodes are rendered directly, not wrapped by decorations
			container.appendChild(renderInlineNode(child, registry));
			globalOffset += 1;
			continue;
		}

		// TextNode: split by decoration boundaries within this node's range
		const textFrom: number = globalOffset;
		const textTo: number = globalOffset + child.text.length;

		if (child.text.length === 0) {
			globalOffset = textTo;
			continue;
		}

		// Find split points within this text range
		const splitSet = new Set<number>();
		splitSet.add(textFrom);
		splitSet.add(textTo);
		for (const deco of inlineDecos) {
			const dFrom: number = Math.max(textFrom, deco.from);
			const dTo: number = Math.min(textTo, deco.to);
			if (dFrom > textFrom && dFrom < textTo) splitSet.add(dFrom);
			if (dTo > textFrom && dTo < textTo) splitSet.add(dTo);
		}
		const splits: number[] = [...splitSet].sort((a, b) => a - b);

		// Render micro-segments
		for (let i = 0; i < splits.length - 1; i++) {
			const from: number | undefined = splits[i];
			const to: number | undefined = splits[i + 1];
			if (from === undefined || to === undefined || from >= to) continue;

			const localFrom: number = from - textFrom;
			const localTo: number = to - textFrom;
			const text: string = child.text.slice(localFrom, localTo);

			// Find decorations that fully cover this micro-segment
			const activeDecos: InlineDecoration[] = [];
			for (const deco of inlineDecos) {
				if (deco.from <= from && deco.to >= to) {
					activeDecos.push(deco);
				}
			}

			// Render: text → marks (inner) → decorations (outer)
			const textNode: Text = document.createTextNode(preserveSpaces(text));
			let current: Node = wrapNodeWithMarks(textNode, child.marks, registry);

			// Wrap with decorations (outermost)
			for (const deco of activeDecos) {
				const el: HTMLElement = createDecorationElement(deco.attrs);
				el.appendChild(current);
				current = el;
			}

			container.appendChild(current);
		}

		globalOffset = textTo;
	}
}

/** Creates a DOM element for an inline decoration. */
function createDecorationElement(attrs: DecorationAttrs): HTMLElement {
	const tagName: string = attrs.nodeName ?? 'span';
	const el: HTMLElement = document.createElement(tagName);
	el.setAttribute('data-decoration', 'true');

	if (attrs.class) {
		for (const cls of attrs.class.split(' ')) {
			if (cls) el.classList.add(cls);
		}
	}
	if (attrs.style) {
		setStyleText(el, attrs.style);
	}

	// Apply any other custom attributes
	for (const [key, value] of Object.entries(attrs)) {
		if (key === 'class' || key === 'style' || key === 'nodeName') continue;
		if (value !== undefined) {
			el.setAttribute(key, value);
		}
	}

	return el;
}

/** Applies node decorations (CSS classes/styles) to a block element. */
export function applyNodeDecorations(
	el: HTMLElement,
	bid: BlockId,
	options?: ReconcileOptions,
): void {
	const nodeDecos = options?.decorations?.findNode(bid);
	if (!nodeDecos || nodeDecos.length === 0) return;

	for (const deco of nodeDecos) {
		if (deco.attrs.class) {
			for (const cls of deco.attrs.class.split(' ')) {
				if (cls) el.classList.add(cls);
			}
		}
		if (deco.attrs.style) {
			appendStyleText(el, deco.attrs.style);
		}
	}
}
