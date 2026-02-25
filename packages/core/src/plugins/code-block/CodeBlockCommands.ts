/**
 * Command registration and implementations for code blocks.
 * Handles toggle, insert, exit, and mark stripping.
 */

import type { BlockNode } from '../../model/Document.js';
import { getBlockLength, getInlineChildren, isTextNode } from '../../model/Document.js';
import { createCollapsedSelection, isGapCursor, isNodeSelection } from '../../model/Selection.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { Transaction, TransactionBuilder } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { handleEscape } from './CodeBlockKeyboardHandlers.js';
import type { CodeBlockConfig } from './CodeBlockTypes.js';

/** Registers all code-block commands. */
export function registerCodeBlockCommands(context: PluginContext, config: CodeBlockConfig): void {
	context.registerCommand('toggleCodeBlock', () => toggleCodeBlock(context, config));

	context.registerCommand('insertCodeBlock', () => insertCodeBlock(context, config));

	context.registerCommand('setCodeBlockLanguage', () => false);

	context.registerCommand('setCodeBlockBackground', () => false);

	context.registerCommand('exitCodeBlock', () => handleEscape(context));
}

// --- Command Implementations ---

function toggleCodeBlock(context: PluginContext, config: CodeBlockConfig): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return false;

	const block: BlockNode | undefined = state.getBlock(state.selection.anchor.blockId);
	if (!block) return false;

	if (block.type === 'code_block') {
		const tr: Transaction = state
			.transaction('command')
			.setBlockType(state.selection.anchor.blockId, nodeType('paragraph'))
			.setSelection(state.selection)
			.build();
		context.dispatch(tr);
		return true;
	}

	return insertCodeBlock(context, config);
}

function insertCodeBlock(context: PluginContext, config: CodeBlockConfig): boolean {
	const state = context.getState();
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return false;

	const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
	if (!block || block.type === 'code_block') return false;

	const attrs: Record<string, string | number | boolean> = {
		language: config.defaultLanguage ?? '',
		backgroundColor: '',
	};

	const builder: TransactionBuilder = state.transaction('command');
	stripAllMarks(builder, block);
	builder
		.setBlockType(sel.anchor.blockId, nodeType('code_block'), attrs)
		.setSelection(createCollapsedSelection(sel.anchor.blockId, 0));

	context.dispatch(builder.build());
	return true;
}

/**
 * Strips all marks from a block's inline content.
 * Used when converting to code_block so no formatting carries over.
 */
function stripAllMarks(builder: TransactionBuilder, block: BlockNode): void {
	const blockLength: number = getBlockLength(block);
	if (blockLength === 0) return;

	const inlineChildren = getInlineChildren(block);
	let offset = 0;

	for (const child of inlineChildren) {
		if (isTextNode(child)) {
			if (child.text.length > 0) {
				for (const mark of child.marks) {
					builder.removeMark(block.id, offset, offset + child.text.length, mark);
				}
			}
			offset += child.text.length;
		} else {
			offset += 1;
		}
	}
}
