/**
 * Block text in model-offset space: every index into the result is a model
 * offset of the block.
 */

import { type BlockNode, getInlineChildren, isTextNode } from './Document.js';
import { INLINE_NODE_PLACEHOLDER } from './InputRule.js';

/**
 * Renders a block's inline content in model-offset space: text verbatim, each
 * inline node as a single {@link INLINE_NODE_PLACEHOLDER}. Unlike
 * `getBlockText`, which drops inline nodes, indices into the result equal
 * model offsets.
 */
export function getBlockOffsetText(block: BlockNode): string {
	let text = '';
	for (const child of getInlineChildren(block)) {
		text += isTextNode(child) ? child.text : INLINE_NODE_PLACEHOLDER;
	}
	return text;
}

/** Model offsets of the inline nodes in a block, the positions {@link getBlockOffsetText} fills with placeholders. */
export function getInlineNodeOffsets(block: BlockNode): ReadonlySet<number> {
	const offsets = new Set<number>();
	let offset = 0;
	for (const child of getInlineChildren(block)) {
		if (isTextNode(child)) {
			offset += child.text.length;
		} else {
			offsets.add(offset);
			offset += 1;
		}
	}
	return offsets;
}
