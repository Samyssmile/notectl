/**
 * Word boundary detection for delete-word and word-movement commands.
 * InlineNodes act as word boundaries.
 */

import { type BlockNode, getBlockLength, getContentAtOffset } from '../model/Document.js';

/**
 * Finds the word boundary backward from the given offset.
 * InlineNodes act as word boundaries.
 */
export function findWordBoundaryBackward(block: BlockNode, offset: number): number {
	let pos = offset - 1;
	// Skip trailing whitespace
	while (pos >= 0) {
		const content = getContentAtOffset(block, pos);
		if (!content || content.kind === 'inline') break;
		if (!/\s/.test(content.char)) break;
		pos--;
	}
	// If at InlineNode, delete just it (treat as word boundary)
	if (pos >= 0) {
		const content = getContentAtOffset(block, pos);
		if (content?.kind === 'inline') return pos;
	}
	// Skip word characters until whitespace or InlineNode
	while (pos >= 0) {
		const content = getContentAtOffset(block, pos);
		if (!content || content.kind === 'inline') break;
		if (/\s/.test(content.char)) break;
		pos--;
	}
	return pos + 1;
}

/**
 * Finds the word boundary forward from the given offset.
 * InlineNodes act as word boundaries.
 */
export function findWordBoundaryForward(block: BlockNode, offset: number): number {
	const len = getBlockLength(block);
	let pos = offset;
	// Skip word characters first
	while (pos < len) {
		const content = getContentAtOffset(block, pos);
		if (!content || content.kind === 'inline') break;
		if (/\s/.test(content.char)) break;
		pos++;
	}
	// If at InlineNode and haven't moved, delete just the InlineNode
	if (pos === offset && pos < len) {
		const content = getContentAtOffset(block, pos);
		if (content?.kind === 'inline') return pos + 1;
	}
	// Skip trailing whitespace
	while (pos < len) {
		const content = getContentAtOffset(block, pos);
		if (!content || content.kind === 'inline') break;
		if (!/\s/.test(content.char)) break;
		pos++;
	}
	return pos;
}
