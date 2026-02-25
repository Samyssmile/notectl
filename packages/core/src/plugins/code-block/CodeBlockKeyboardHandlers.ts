/**
 * Keyboard handlers for code-block navigation and editing.
 * Handles Enter, Backspace, Tab, Shift-Tab, Escape, Arrow keys,
 * and configurable shortcuts (Mod+Enter, toggle).
 */

import type { BlockNode } from '../../model/Document.js';
import { generateBlockId, getBlockLength, getBlockText } from '../../model/Document.js';
import {
	createCollapsedSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import type { CodeBlockConfig, CodeBlockKeymap } from './CodeBlockTypes.js';

// --- Context Guard ---

interface CodeBlockContext {
	readonly state: EditorState;
	readonly block: BlockNode;
	readonly blockId: BlockId;
	readonly offset: number;
}

/**
 * Guards against NodeSelection and non-code-block blocks.
 * Returns false (not handled) if the cursor is not inside a code block.
 */
function withCodeBlockContext(
	context: PluginContext,
	handler: (ctx: CodeBlockContext) => boolean,
): boolean {
	const state: EditorState = context.getState();
	if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return false;

	const sel = state.selection;
	const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
	if (!block || block.type !== 'code_block') return false;

	return handler({
		state,
		block,
		blockId: sel.anchor.blockId,
		offset: sel.anchor.offset,
	});
}

/** Registers all code-block keyboard handlers. */
export function registerCodeBlockKeymaps(
	context: PluginContext,
	config: CodeBlockConfig,
	resolvedKeymap: Readonly<Record<keyof CodeBlockKeymap, string | null>>,
): void {
	const keymap: Record<string, () => boolean> = {
		Enter: () => handleEnter(context),
		Backspace: () => handleBackspace(context),
		Tab: () => handleTab(context, config),
		'Shift-Tab': () => handleShiftTab(context, config),
		Escape: () => handleEscape(context),
		ArrowDown: () => handleArrowDown(context),
		ArrowUp: () => handleArrowUp(context),
		ArrowRight: () => handleArrowRight(context),
		ArrowLeft: () => handleArrowLeft(context),
	};

	const { insertAfter, toggle } = resolvedKeymap;

	if (insertAfter) {
		keymap[insertAfter] = () => handleModEnter(context);
	}
	if (toggle) {
		keymap[toggle] = () => context.executeCommand('toggleCodeBlock');
	}

	context.registerKeymap(keymap, { priority: 'context' });
}

// --- Handler Functions ---

function handleBackspace(context: PluginContext): boolean {
	return withCodeBlockContext(context, ({ state, blockId, offset }) => {
		if (!isCollapsed(state.selection)) return false;
		if (offset !== 0) return false;

		const tr: Transaction = state
			.transaction('input')
			.setBlockType(blockId, nodeType('paragraph'))
			.setSelection(state.selection)
			.build();
		context.dispatch(tr);
		return true;
	});
}

function handleEnter(context: PluginContext): boolean {
	return withCodeBlockContext(context, ({ state, block, blockId, offset }) => {
		if (!isCollapsed(state.selection)) return false;

		const text: string = getBlockText(block);

		if (text.endsWith('\n') && offset === text.length) {
			return exitOnDoubleEnter(context, blockId, text);
		}

		const tr: Transaction = state
			.transaction('input')
			.insertText(blockId, offset, '\n', [])
			.setSelection(createCollapsedSelection(blockId, offset + 1))
			.build();

		context.dispatch(tr);
		return true;
	});
}

function handleTab(context: PluginContext, config: CodeBlockConfig): boolean {
	return withCodeBlockContext(context, ({ state, blockId, offset }) => {
		const indent: string = config.useSpaces ? ' '.repeat(config.spaceCount ?? 2) : '\t';

		const tr: Transaction = state
			.transaction('input')
			.insertText(blockId, offset, indent, [])
			.setSelection(createCollapsedSelection(blockId, offset + indent.length))
			.build();

		context.dispatch(tr);
		return true;
	});
}

function handleShiftTab(context: PluginContext, config: CodeBlockConfig): boolean {
	return withCodeBlockContext(context, ({ state, block, blockId, offset }) => {
		const text: string = getBlockText(block);
		const lineStart: number = text.lastIndexOf('\n', offset - 1) + 1;

		if (config.useSpaces) {
			const spaceCount: number = config.spaceCount ?? 2;
			const linePrefix: string = text.slice(lineStart, lineStart + spaceCount);
			if (linePrefix === ' '.repeat(spaceCount)) {
				const tr: Transaction = state
					.transaction('input')
					.deleteTextAt(blockId, lineStart, lineStart + spaceCount)
					.setSelection(createCollapsedSelection(blockId, Math.max(lineStart, offset - spaceCount)))
					.build();
				context.dispatch(tr);
				return true;
			}
		} else if (text[lineStart] === '\t') {
			const tr: Transaction = state
				.transaction('input')
				.deleteTextAt(blockId, lineStart, lineStart + 1)
				.setSelection(createCollapsedSelection(blockId, Math.max(lineStart, offset - 1)))
				.build();
			context.dispatch(tr);
			return true;
		}

		return true; // Consume event even if no dedent possible
	});
}

/**
 * Exits the code block to the next block or creates a new paragraph.
 * Exported for use by the `exitCodeBlock` command.
 */
export function handleEscape(context: PluginContext): boolean {
	return withCodeBlockContext(context, ({ state, blockId }) => {
		const blockOrder: readonly BlockId[] = state.getBlockOrder();
		const idx: number = blockOrder.indexOf(blockId);

		if (idx < blockOrder.length - 1) {
			const nextId: BlockId = blockOrder[idx + 1] as BlockId;
			const tr: Transaction = state
				.transaction('command')
				.setSelection(createCollapsedSelection(nextId, 0))
				.build();
			context.dispatch(tr);
		} else {
			insertParagraphAfter(context, blockId);
		}

		return true;
	});
}

function handleArrowDown(context: PluginContext): boolean {
	return withCodeBlockContext(context, ({ state, block, blockId, offset }) => {
		if (!isCollapsed(state.selection)) return false;

		const text: string = getBlockText(block);
		const nextNewline: number = text.indexOf('\n', offset);
		if (nextNewline !== -1) return false;

		const blockOrder: readonly BlockId[] = state.getBlockOrder();
		const idx: number = blockOrder.indexOf(blockId);

		if (idx < blockOrder.length - 1) {
			const nextId: BlockId = blockOrder[idx + 1] as BlockId;
			const tr: Transaction = state
				.transaction('command')
				.setSelection(createCollapsedSelection(nextId, 0))
				.build();
			context.dispatch(tr);
		} else {
			insertParagraphAfter(context, blockId);
		}

		return true;
	});
}

function handleArrowUp(context: PluginContext): boolean {
	return withCodeBlockContext(context, ({ state, block, blockId, offset }) => {
		if (!isCollapsed(state.selection)) return false;

		const text: string = getBlockText(block);
		const firstNewline: number = text.indexOf('\n');
		if (firstNewline !== -1 && offset > firstNewline) {
			return false;
		}

		const blockOrder: readonly BlockId[] = state.getBlockOrder();
		const idx: number = blockOrder.indexOf(blockId);

		if (idx > 0) {
			const prevId: BlockId = blockOrder[idx - 1] as BlockId;
			const prevBlock: BlockNode | undefined = state.getBlock(prevId);
			const prevLen: number = prevBlock ? getBlockLength(prevBlock) : 0;
			const tr: Transaction = state
				.transaction('command')
				.setSelection(createCollapsedSelection(prevId, prevLen))
				.build();
			context.dispatch(tr);
			return true;
		}

		return false;
	});
}

function handleArrowRight(context: PluginContext): boolean {
	return withCodeBlockContext(context, ({ state, block, blockId, offset }) => {
		if (!isCollapsed(state.selection)) return false;

		const text: string = getBlockText(block);
		if (offset !== text.length) return false;

		const blockOrder: readonly BlockId[] = state.getBlockOrder();
		const idx: number = blockOrder.indexOf(blockId);

		if (idx < blockOrder.length - 1) {
			const nextId: BlockId = blockOrder[idx + 1] as BlockId;
			const tr: Transaction = state
				.transaction('command')
				.setSelection(createCollapsedSelection(nextId, 0))
				.build();
			context.dispatch(tr);
		} else {
			insertParagraphAfter(context, blockId);
		}

		return true;
	});
}

function handleArrowLeft(context: PluginContext): boolean {
	return withCodeBlockContext(context, ({ state, blockId, offset }) => {
		if (!isCollapsed(state.selection)) return false;
		if (offset !== 0) return false;

		const blockOrder: readonly BlockId[] = state.getBlockOrder();
		const idx: number = blockOrder.indexOf(blockId);

		if (idx > 0) {
			const prevId: BlockId = blockOrder[idx - 1] as BlockId;
			const prevBlock: BlockNode | undefined = state.getBlock(prevId);
			const prevLen: number = prevBlock ? getBlockLength(prevBlock) : 0;
			const tr: Transaction = state
				.transaction('command')
				.setSelection(createCollapsedSelection(prevId, prevLen))
				.build();
			context.dispatch(tr);
			return true;
		}

		return false;
	});
}

function handleModEnter(context: PluginContext): boolean {
	return withCodeBlockContext(context, ({ blockId }) => {
		insertParagraphAfter(context, blockId);
		return true;
	});
}

// --- Shared Helpers ---

function insertParagraphAfter(context: PluginContext, bid: BlockId): void {
	const state: EditorState = context.getState();
	const block: BlockNode | undefined = state.getBlock(bid);
	if (!block) return;

	const blockLength: number = getBlockLength(block);
	const newId: BlockId = generateBlockId();

	const tr: Transaction = state
		.transaction('command')
		.splitBlock(bid, blockLength, newId)
		.setBlockType(newId, nodeType('paragraph'))
		.setSelection(createCollapsedSelection(newId, 0))
		.build();

	context.dispatch(tr);
}

function exitOnDoubleEnter(context: PluginContext, bid: BlockId, text: string): boolean {
	const state: EditorState = context.getState();
	const trimmedLen: number = text.length - 1;
	const newId: BlockId = generateBlockId();

	const tr: Transaction = state
		.transaction('input')
		.deleteTextAt(bid, trimmedLen, text.length)
		.splitBlock(bid, trimmedLen, newId)
		.setBlockType(newId, nodeType('paragraph'))
		.setSelection(createCollapsedSelection(newId, 0))
		.build();

	context.dispatch(tr);
	return true;
}
