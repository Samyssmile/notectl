/**
 * Command registration and implementations for code blocks.
 * Handles toggle, insert, exit, and mark stripping.
 */

import {
	createSelectionForBlockBoundary,
	extractParentPath,
	findSiblingIndex,
	getSiblings,
} from '../../commands/CommandHelpers.js';
import type { BlockNode } from '../../model/Document.js';
import {
	createEmptyParagraph,
	generateBlockId,
	getBlockLength,
	getInlineChildren,
	isBlockNode,
	isTextNode,
} from '../../model/Document.js';
import { findNodePath } from '../../model/NodeResolver.js';
import { createCollapsedSelection, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
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

	context.registerCommand('deleteCodeBlock', () => deleteCodeBlock(context));
}

// --- Command Implementations ---

function toggleCodeBlock(context: PluginContext, config: CodeBlockConfig): boolean {
	const state = context.getState();
	if (!isTextSelection(state.selection)) return false;

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
	if (!isTextSelection(sel)) return false;

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

/** Deletes the code block at the current cursor position. */
function deleteCodeBlock(context: PluginContext): boolean {
	const state = context.getState();
	if (!isTextSelection(state.selection)) return false;

	const block: BlockNode | undefined = state.getBlock(state.selection.anchor.blockId);
	if (!block || block.type !== 'code_block') return false;

	const tr: Transaction | null = createDeleteCodeBlockTransaction(state, block.id);
	if (!tr) return false;

	context.dispatch(tr);
	return true;
}

/** Builds a transaction that removes a code block and repositions the cursor. */
export function createDeleteCodeBlockTransaction(
	state: EditorState,
	blockId: BlockId,
): Transaction | null {
	const path: string[] | undefined = findNodePath(state.doc, blockId);
	if (!path) return null;

	const parentPath: BlockId[] = extractParentPath(path);
	const siblings = getSiblings(state, parentPath);
	const index: number = findSiblingIndex(siblings, blockId);
	if (index < 0) return null;

	const builder = state.transaction('command');

	if (siblings.length === 1) {
		const newId: BlockId = generateBlockId();
		builder.insertNode(parentPath, 0, createEmptyParagraph(newId));
		builder.removeNode(parentPath, 1);
		builder.setSelection(createCollapsedSelection(newId, 0));
		return builder.build();
	}

	builder.removeNode(parentPath, index);

	const prevSibling = siblings[index - 1];
	if (prevSibling && isBlockNode(prevSibling)) {
		const selection = createSelectionForBlockBoundary(state, prevSibling.id, 'end');
		if (selection) {
			builder.setSelection(selection);
			return builder.build();
		}
	}

	const nextSibling = siblings[index + 1];
	if (nextSibling && isBlockNode(nextSibling)) {
		const selection = createSelectionForBlockBoundary(state, nextSibling.id, 'start');
		if (selection) {
			builder.setSelection(selection);
		}
	}

	return builder.build();
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
