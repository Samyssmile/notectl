/**
 * Keyboard handlers for code-block navigation and editing.
 * Handles Enter (with auto-indent + block-pattern), Backspace (with pair-delete),
 * Tab, Shift-Tab (with multi-line range handling), Escape, Arrow keys, and
 * configurable shortcuts (Mod+Enter, toggle).
 */

import type { BlockNode } from '../../model/Document.js';
import { generateBlockId, getBlockLength, getBlockText } from '../../model/Document.js';
import {
	type Selection,
	createCollapsedSelection,
	createSelection,
	isCollapsed,
	isForward,
	isTextSelection,
	selectionRange,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import type { CodeBlockLocale } from './CodeBlockLocale.js';
import type {
	CodeBlockConfig,
	CodeBlockKeymap,
	ResolvedIndentConfig,
	ResolvedPairingConfig,
} from './CodeBlockTypes.js';
import {
	dedentOnce,
	getCurrentLineIndent,
	getLineRange,
	nextIndentLevel,
	resolveIndentUnit,
	shouldOpenIndentBlock,
} from './IndentHelpers.js';
import type { PairStack } from './PairStack.js';

// --- Context Guard ---

interface CodeBlockContext {
	readonly state: EditorState;
	readonly sel: Selection;
	readonly block: BlockNode;
	readonly blockId: BlockId;
	readonly offset: number;
}

function withCodeBlockContext(
	context: PluginContext,
	handler: (ctx: CodeBlockContext) => boolean,
): boolean {
	const state: EditorState = context.getState();
	if (!isTextSelection(state.selection)) return false;

	const sel: Selection = state.selection;
	const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
	if (!block || block.type !== 'code_block') return false;

	return handler({
		state,
		sel,
		block,
		blockId: sel.anchor.blockId,
		offset: sel.anchor.offset,
	});
}

/** Dependencies for the keyboard handlers. */
export interface CodeBlockKeyboardDeps {
	readonly indent: ResolvedIndentConfig;
	readonly pairing: ResolvedPairingConfig;
	readonly pairStack: PairStack;
	readonly locale: () => CodeBlockLocale;
}

/** Registers all code-block keyboard handlers. */
export function registerCodeBlockKeymaps(
	context: PluginContext,
	config: CodeBlockConfig,
	resolvedKeymap: Readonly<Record<keyof CodeBlockKeymap, string | null>>,
	deps: CodeBlockKeyboardDeps,
): void {
	const keymap: Record<string, () => boolean> = {
		Enter: () => handleEnter(context, deps),
		Backspace: () => handleBackspace(context, deps),
		Tab: () => handleTab(context, deps),
		'Shift-Tab': () => handleShiftTab(context, deps),
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

	// `config` is kept in the signature for future language-defined indent rules.
	void config;
}

// --- Handler Functions ---

function handleBackspace(context: PluginContext, deps: CodeBlockKeyboardDeps): boolean {
	return withCodeBlockContext(context, ({ state, block, blockId, offset }) => {
		if (!isCollapsed(state.selection)) return false;

		// Pair-delete: backspace between an auto-paired empty pair removes both chars.
		if (deps.pairing.deletePair && offset > 0) {
			const text: string = getBlockText(block);
			const before = text[offset - 1];
			const after = text[offset];
			if (before && after && isMatchingPair(before, after)) {
				const entry = deps.pairStack.peek(blockId, offset);
				if (entry && entry.char === after) {
					const tr: Transaction = state
						.transaction('input')
						.deleteTextAt(blockId, offset - 1, offset + 1)
						.setSelection(createCollapsedSelection(blockId, offset - 1))
						.build();
					context.dispatch(tr);
					return true;
				}
			}
		}

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

function handleEnter(context: PluginContext, deps: CodeBlockKeyboardDeps): boolean {
	return withCodeBlockContext(context, ({ state, block, blockId, offset }) => {
		if (!isCollapsed(state.selection)) return false;

		const text: string = getBlockText(block);
		if (text.endsWith('\n') && offset === text.length) {
			return exitOnDoubleEnter(context, blockId, text);
		}

		const unit: string = resolveIndentUnit(deps.indent.useSpaces, deps.indent.spaceCount);

		// Block-pattern: cursor between matching open/close → 3-line layout.
		if (deps.indent.mode === 'brackets' && shouldOpenIndentBlock(text, offset)) {
			const baseIndent: string = getCurrentLineIndent(text, offset);
			const insert = `\n${baseIndent}${unit}\n${baseIndent}`;
			const cursorOffset: number = offset + 1 + baseIndent.length + unit.length;
			const tr: Transaction = state
				.transaction('input')
				.insertText(blockId, offset, insert, [])
				.setSelection(createCollapsedSelection(blockId, cursorOffset))
				.build();
			context.dispatch(tr);
			return true;
		}

		const indent: string = nextIndentLevel(text, offset, deps.indent.mode, unit);
		const insert = `\n${indent}`;
		const tr: Transaction = state
			.transaction('input')
			.insertText(blockId, offset, insert, [])
			.setSelection(createCollapsedSelection(blockId, offset + insert.length))
			.build();

		context.dispatch(tr);
		return true;
	});
}

function handleTab(context: PluginContext, deps: CodeBlockKeyboardDeps): boolean {
	return withCodeBlockContext(context, ({ state, sel, block, blockId, offset }) => {
		const unit: string = resolveIndentUnit(deps.indent.useSpaces, deps.indent.spaceCount);

		if (isCollapsed(sel)) {
			const tr: Transaction = state
				.transaction('input')
				.insertText(blockId, offset, unit, [])
				.setSelection(createCollapsedSelection(blockId, offset + unit.length))
				.build();
			context.dispatch(tr);
			return true;
		}

		// Range selection — must be within this code block.
		if (sel.anchor.blockId !== blockId || sel.head.blockId !== blockId) return false;

		const text: string = getBlockText(block);
		const range = selectionRange(sel, state.getBlockOrder());
		const fromOffset: number = range.from.offset;
		const toOffset: number = range.to.offset;
		const spansLine: boolean = text.slice(fromOffset, toOffset).includes('\n');

		if (!spansLine) {
			// VS Code-style: replace selection with one indent unit.
			const tr: Transaction = state
				.transaction('input')
				.deleteTextAt(blockId, fromOffset, toOffset)
				.insertText(blockId, fromOffset, unit, [])
				.setSelection(createCollapsedSelection(blockId, fromOffset + unit.length))
				.build();
			context.dispatch(tr);
			return true;
		}

		// Multi-line indent.
		const result = indentLineRange(text, fromOffset, toOffset, unit);
		const builder = state.transaction('input');
		// Apply in reverse so earlier offsets remain valid after each insert.
		for (let i = result.inserts.length - 1; i >= 0; i--) {
			const insert = result.inserts[i];
			if (!insert) continue;
			builder.insertText(blockId, insert.offset, insert.text, []);
		}
		const wasForward: boolean = isForward(sel, state.getBlockOrder());
		const newFrom: number = result.lineStart;
		const newTo: number = toOffset + result.totalInserted;
		const anchorOff: number = wasForward ? newFrom : newTo;
		const headOff: number = wasForward ? newTo : newFrom;
		builder.setSelection(
			createSelection({ blockId, offset: anchorOff }, { blockId, offset: headOff }),
		);
		context.dispatch(builder.build());

		if (result.lineCount >= 2) {
			context.announce(deps.locale().indentedNLines(result.lineCount));
		}
		return true;
	});
}

function handleShiftTab(context: PluginContext, deps: CodeBlockKeyboardDeps): boolean {
	return withCodeBlockContext(context, ({ state, sel, block, blockId, offset }) => {
		const text: string = getBlockText(block);

		if (isCollapsed(sel)) {
			return dedentSingleLine(context, state, blockId, offset, text, deps);
		}

		if (sel.anchor.blockId !== blockId || sel.head.blockId !== blockId) return false;

		const range = selectionRange(sel, state.getBlockOrder());
		const fromOffset: number = range.from.offset;
		const toOffset: number = range.to.offset;
		const spansLine: boolean = text.slice(fromOffset, toOffset).includes('\n');

		if (!spansLine) {
			return dedentSingleLine(context, state, blockId, offset, text, deps);
		}

		const result = dedentLineRange(
			text,
			fromOffset,
			toOffset,
			deps.indent.useSpaces,
			deps.indent.spaceCount,
		);
		if (result.totalRemoved === 0) {
			// Nothing to remove — consume the event so the browser does not move focus.
			return true;
		}

		const builder = state.transaction('input');
		for (let i = result.deletes.length - 1; i >= 0; i--) {
			const del = result.deletes[i];
			if (!del) continue;
			builder.deleteTextAt(blockId, del.from, del.to);
		}
		const wasForward: boolean = isForward(sel, state.getBlockOrder());
		const newFrom: number = result.lineStart;
		const newTo: number = toOffset - result.totalRemoved;
		const anchorOff: number = wasForward ? newFrom : Math.max(newFrom, newTo);
		const headOff: number = wasForward ? Math.max(newFrom, newTo) : newFrom;
		builder.setSelection(
			createSelection({ blockId, offset: anchorOff }, { blockId, offset: headOff }),
		);
		context.dispatch(builder.build());

		if (result.lineCount >= 2) {
			context.announce(deps.locale().dedentedNLines(result.lineCount));
		}
		return true;
	});
}

function dedentSingleLine(
	context: PluginContext,
	state: EditorState,
	blockId: BlockId,
	offset: number,
	text: string,
	deps: CodeBlockKeyboardDeps,
): boolean {
	const { start } = getLineRange(text, offset);
	const lineText: string = text.slice(start);
	const removed = dedentOnce(lineText, deps.indent.useSpaces, deps.indent.spaceCount);
	if (removed.removed.length === 0) return true;

	const tr: Transaction = state
		.transaction('input')
		.deleteTextAt(blockId, start, start + removed.removed.length)
		.setSelection(
			createCollapsedSelection(blockId, Math.max(start, offset - removed.removed.length)),
		)
		.build();
	context.dispatch(tr);
	return true;
}

/**
 * Exits the code block to the next block or creates a new paragraph.
 * Exported for use by the `exitCodeBlock` command.
 */
export function handleEscape(context: PluginContext): boolean {
	return withCodeBlockContext(context, ({ state, blockId }) => {
		moveToNextBlockOrInsertParagraph(context, state, blockId);
		return true;
	});
}

function handleArrowDown(context: PluginContext): boolean {
	return withCodeBlockContext(context, ({ state, block, blockId, offset }) => {
		if (!isCollapsed(state.selection)) return false;

		const text: string = getBlockText(block);
		const nextNewline: number = text.indexOf('\n', offset);
		if (nextNewline !== -1) return false;

		moveToNextBlockOrInsertParagraph(context, state, blockId);
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

		return moveToPreviousBlockEnd(context, state, blockId);
	});
}

function handleArrowRight(context: PluginContext): boolean {
	return withCodeBlockContext(context, ({ state, block, blockId, offset }) => {
		if (!isCollapsed(state.selection)) return false;

		const text: string = getBlockText(block);
		if (offset !== text.length) return false;

		moveToNextBlockOrInsertParagraph(context, state, blockId);
		return true;
	});
}

function handleArrowLeft(context: PluginContext): boolean {
	return withCodeBlockContext(context, ({ state, blockId, offset }) => {
		if (!isCollapsed(state.selection)) return false;
		if (offset !== 0) return false;

		return moveToPreviousBlockEnd(context, state, blockId);
	});
}

function handleModEnter(context: PluginContext): boolean {
	return withCodeBlockContext(context, ({ blockId }) => {
		insertParagraphAfter(context, blockId);
		return true;
	});
}

// --- Multi-line indent helpers ---

interface IndentRangeResult {
	readonly inserts: readonly { offset: number; text: string }[];
	readonly totalInserted: number;
	readonly lineCount: number;
	readonly lineStart: number;
}

function indentLineRange(text: string, from: number, to: number, unit: string): IndentRangeResult {
	const lineStart: number = text.lastIndexOf('\n', from - 1) + 1;
	const inserts: { offset: number; text: string }[] = [];
	let lineCount = 0;

	let pos: number = lineStart;
	while (pos < to) {
		inserts.push({ offset: pos, text: unit });
		lineCount++;
		const nl: number = text.indexOf('\n', pos);
		if (nl === -1 || nl >= to) break;
		pos = nl + 1;
	}

	return {
		inserts,
		totalInserted: lineCount * unit.length,
		lineCount,
		lineStart,
	};
}

interface DedentRangeResult {
	readonly deletes: readonly { from: number; to: number }[];
	readonly totalRemoved: number;
	readonly lineCount: number;
	readonly lineStart: number;
}

function dedentLineRange(
	text: string,
	from: number,
	to: number,
	useSpaces: boolean,
	spaceCount: number,
): DedentRangeResult {
	const lineStart: number = text.lastIndexOf('\n', from - 1) + 1;
	const deletes: { from: number; to: number }[] = [];
	let totalRemoved = 0;
	let lineCount = 0;

	let pos: number = lineStart;
	while (pos < to) {
		lineCount++;
		const lineSlice: string = text.slice(pos);
		const result = dedentOnce(lineSlice, useSpaces, spaceCount);
		if (result.removed.length > 0) {
			deletes.push({ from: pos, to: pos + result.removed.length });
			totalRemoved += result.removed.length;
		}
		const nl: number = text.indexOf('\n', pos);
		if (nl === -1 || nl >= to) break;
		pos = nl + 1;
	}

	return {
		deletes,
		totalRemoved,
		lineCount,
		lineStart,
	};
}

// --- Other helpers ---

function isMatchingPair(open: string, close: string): boolean {
	switch (open) {
		case '(':
			return close === ')';
		case '[':
			return close === ']';
		case '{':
			return close === '}';
		case '"':
		case "'":
		case '`':
			return close === open;
		default:
			return false;
	}
}

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

/**
 * Moves the cursor to the start of the following block, or appends a fresh
 * paragraph when the code block is the last block. Shared exit tail for
 * Escape / ArrowDown / ArrowRight at the end of the code block.
 */
function moveToNextBlockOrInsertParagraph(
	context: PluginContext,
	state: EditorState,
	bid: BlockId,
): void {
	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const idx: number = blockOrder.indexOf(bid);

	if (idx < blockOrder.length - 1) {
		const nextId: BlockId = blockOrder[idx + 1] as BlockId;
		const tr: Transaction = state
			.transaction('command')
			.setSelection(createCollapsedSelection(nextId, 0))
			.build();
		context.dispatch(tr);
		return;
	}

	insertParagraphAfter(context, bid);
}

/**
 * Moves the cursor to the end of the preceding block. Shared tail for
 * ArrowUp / ArrowLeft at the start of the code block. Returns `false` when the
 * code block is already the first block (no movement performed).
 */
function moveToPreviousBlockEnd(context: PluginContext, state: EditorState, bid: BlockId): boolean {
	const blockOrder: readonly BlockId[] = state.getBlockOrder();
	const idx: number = blockOrder.indexOf(bid);
	if (idx <= 0) return false;

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
