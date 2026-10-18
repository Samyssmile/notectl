/**
 * PasteCommand: builds transactions from a ContentSlice and EditorState.
 * Handles three strategies: inline paste, single-block paste, multi-block paste.
 */

import { canContain } from '../model/ContentModel.js';
import type { ContentSlice, SliceBlock } from '../model/ContentSlice.js';
import { segmentsLength } from '../model/ContentSlice.js';
import type { BlockAttrValue, BlockAttrs, BlockNode } from '../model/Document.js';
import { createBlockNode, generateBlockId, segmentsToInlineChildren } from '../model/Document.js';
import type { ContentSegment } from '../model/Document.js';
import { findNodePath } from '../model/NodeResolver.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import type { GapCursorSelection } from '../model/Selection.js';
import { createCollapsedSelection, isGapCursor, isNodeSelection } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { nodeType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction, TransactionBuilder } from '../state/Transaction.js';
import { resolveRootEscapeContext, resolveRootInsertionContext } from './BlockInsertion.js';
import { extractParentPath, findSiblingIndex, getSiblings } from './CommandHelpers.js';
import { type ReplacementTarget, resolveReplacementTarget } from './SelectionReplacement.js';

/**
 * Builds a transaction that pastes the given ContentSlice into the editor state.
 * Selects the appropriate strategy based on the slice structure.
 */
export function pasteSlice(state: EditorState, slice: ContentSlice): Transaction {
	if (slice.blocks.length === 0) {
		return state.transaction('paste').setSelection(state.selection).build();
	}

	const firstBlock: SliceBlock | undefined = slice.blocks[0];
	if (!firstBlock) {
		return state.transaction('paste').setSelection(state.selection).build();
	}

	if (slice.blocks.length === 1 && firstBlock.type === nodeType('paragraph')) {
		return pasteInline(state, firstBlock);
	}
	if (slice.blocks.length === 1) {
		return pasteSingleBlock(state, firstBlock);
	}
	return pasteMultiBlock(state, slice);
}

interface PasteTarget extends ReplacementTarget {
	readonly builder: TransactionBuilder;
}

/**
 * Shared preamble for the text-selection paste strategies: opens a paste
 * builder, deletes any range selection, and resolves the insert position.
 */
function resolvePasteTarget(state: EditorState): PasteTarget {
	const builder: TransactionBuilder = state.transaction('paste');
	return { builder, ...resolveReplacementTarget(state, builder) };
}

/**
 * Inserts content segments at a position by interleaving `insertText` and
 * `insertInlineNode` steps. Consecutive text segments are coalesced into a single
 * mark-preserving `insertText`. Returns the resulting end offset.
 */
function insertSegmentsAt(
	builder: TransactionBuilder,
	blockId: BlockId,
	startOffset: number,
	segments: readonly ContentSegment[],
): number {
	let offset: number = startOffset;
	let textRun: ContentSegment[] = [];

	const flushTextRun = (): void => {
		if (textRun.length === 0) return;
		const text: string = textRun.map((s) => (s.kind === 'text' ? s.text : '')).join('');
		if (text.length > 0) {
			builder.insertText(blockId, offset, text, [], textRun);
			offset += text.length;
		}
		textRun = [];
	};

	for (const segment of segments) {
		if (segment.kind === 'inline') {
			flushTextRun();
			builder.insertInlineNode(blockId, offset, segment.node);
			offset += 1;
		} else {
			textRun.push(segment);
		}
	}
	flushTextRun();

	return offset;
}

/** Case 1: single paragraph — insert segments into current block. */
function pasteInline(state: EditorState, block: SliceBlock): Transaction {
	const sel = state.selection;
	if (isNodeSelection(sel)) {
		return state.transaction('paste').setSelection(sel).build();
	}
	if (isGapCursor(sel)) {
		return pasteBlocksAtGap(state, sel, [block]);
	}
	const { builder, blockId, offset } = resolvePasteTarget(state);
	const endOffset: number = insertSegmentsAt(builder, blockId, offset, block.segments);
	applyParagraphAttrs(state, builder, blockId, block.attrs);
	builder.setSelection(createCollapsedSelection(blockId, endOffset));

	return builder.build();
}

/** Case 2: single non-paragraph block — change block type and insert segments. */
function pasteSingleBlock(state: EditorState, block: SliceBlock): Transaction {
	const sel = state.selection;
	if (isNodeSelection(sel)) {
		return state.transaction('paste').setSelection(sel).build();
	}
	if (isGapCursor(sel)) {
		return pasteBlocksAtGap(state, sel, [block]);
	}
	const { builder, blockId, offset } = resolvePasteTarget(state);

	builder.setBlockType(blockId, block.type, block.attrs);
	const endOffset: number = insertSegmentsAt(builder, blockId, offset, block.segments);
	builder.setSelection(createCollapsedSelection(blockId, endOffset));

	return builder.build();
}

/** Case 3: multiple blocks — split-insert-merge strategy. */
function pasteMultiBlock(state: EditorState, slice: ContentSlice): Transaction {
	const sel = state.selection;
	if (isNodeSelection(sel)) {
		return state.transaction('paste').setSelection(sel).build();
	}
	if (isGapCursor(sel)) {
		return pasteBlocksAtGap(state, sel, slice.blocks);
	}
	const { builder, blockId, offset, state: workingState } = resolvePasteTarget(state);
	// Resolve the target's actual siblings in the document after the deletion,
	// never from the flat leaf traversal order.
	const context = resolveRootInsertionContext(workingState, blockId);
	const target = workingState.getBlock(blockId);
	if (!context || !target) return builder.build();

	const firstSlice: SliceBlock | undefined = slice.blocks[0];
	const lastSlice: SliceBlock | undefined = slice.blocks[slice.blocks.length - 1];
	if (!firstSlice || !lastSlice) {
		return builder.build();
	}
	const middleSlices: readonly SliceBlock[] = slice.blocks.slice(1, -1).map((block) => {
		if (block.type !== 'paragraph' || target.type !== 'list_item') return block;
		return {
			...block,
			type: target.type,
			attrs: { ...target.attrs, ...supportedParagraphAttrs(state, target.type, block.attrs) },
		};
	});

	// Check the resulting boundary types as well as the middle blocks before
	// modifying the target. If any type is forbidden, the original slice escapes
	// intact after the outermost container (#166), without splitting its text.
	const parent = workingState.getParent(blockId);
	const resultTypes = [
		firstSlice.type === 'paragraph' ? target.type : firstSlice.type,
		...middleSlices.map((block) => block.type),
		lastSlice.type === 'paragraph' ? target.type : lastSlice.type,
	];
	if (parent && resultTypes.some((type) => !canContain(state.schema, parent.type, type))) {
		const escapeContext = resolveRootEscapeContext(workingState, blockId);
		if (escapeContext) {
			insertSliceBlocks(
				builder,
				escapeContext.parentPath,
				escapeContext.anchorIndex + 1,
				slice.blocks,
			);
		}
		return builder.build();
	}

	// 1. Insert first slice's segments into current block
	const firstEnd: number = insertSegmentsAt(builder, blockId, offset, firstSlice.segments);

	// 2. Split first, before any retyping, so the tail inherits the caret block's
	//    ORIGINAL type and attrs. Retyping the prefix before the split would leak
	//    the first slice's type into the tail (e.g. a heading-first multi-block
	//    slice would wrongly leave the tail a heading), and a neutral paragraph
	//    boundary slice would strip a non-paragraph caret block (list item,
	//    heading) of its type. setBlockType does not shift offsets, so moving it
	//    past the split is position-neutral.
	const tailBlockId = generateBlockId();
	builder.splitBlock(blockId, firstEnd, tailBlockId);

	// 3. A paragraph keeps the target's type and applies only its explicit, supported attributes.
	if (firstSlice.type !== nodeType('paragraph')) {
		builder.setBlockType(blockId, firstSlice.type, firstSlice.attrs);
	} else {
		applyParagraphAttrs(state, builder, blockId, firstSlice.attrs);
	}

	// 4. Insert middle blocks between first and tail
	let insertAt: number = context.anchorIndex + 1;
	for (const mid of middleSlices) {
		const newBlock = createBlockNode(
			mid.type,
			segmentsToInlineChildren(mid.segments),
			generateBlockId(),
			mid.attrs,
		);
		builder.insertNode(context.parentPath, insertAt, newBlock);
		insertAt++;
	}

	// 5. Insert last slice's segments at start of tail block
	insertSegmentsAt(builder, tailBlockId, 0, lastSlice.segments);

	// 6. Change tail block type if needed
	if (lastSlice.type !== nodeType('paragraph')) {
		builder.setBlockType(tailBlockId, lastSlice.type, lastSlice.attrs);
	} else {
		applyParagraphAttrs(state, builder, tailBlockId, lastSlice.attrs);
	}

	// 7. Set cursor to end of inserted content
	builder.setSelection(createCollapsedSelection(tailBlockId, segmentsLength(lastSlice.segments)));

	return builder.build();
}

/** Keeps the destination's type and unrelated attributes when a paragraph carries formatting. */
function applyParagraphAttrs(
	state: EditorState,
	builder: TransactionBuilder,
	blockId: BlockId,
	attrs: BlockAttrs | undefined,
): void {
	if (!attrs || Object.keys(attrs).length === 0) return;
	// Resolve against the pending edits: deletion and splitting can create a new landing block.
	const workingState: EditorState = state.apply(builder.build());
	const block: BlockNode | undefined = workingState.getBlock(blockId);
	const path: readonly BlockId[] | undefined = workingState.getNodePath(blockId);
	if (!block || !path) return;
	const accepted = supportedParagraphAttrs(state, block.type, attrs);
	if (Object.keys(accepted).length > 0) {
		builder.setNodeAttr(path, { ...block.attrs, ...accepted });
	}
}

/** Paragraph formatting applies only when supported by the destination type. */
function supportedParagraphAttrs(
	state: EditorState,
	type: string,
	attrs: BlockAttrs | undefined,
): BlockAttrs {
	const spec: NodeSpec | undefined = state.schema.getNodeSpec?.(type);
	const accepted: Record<string, BlockAttrValue> = {};
	for (const [name, value] of Object.entries(attrs ?? {})) {
		if (!spec || spec.attrs?.[name]) accepted[name] = value;
	}
	return accepted;
}

// --- GapCursor Paste Helpers ---

/**
 * Resolves the insert position for a GapCursor: parent path and index
 * within siblings where new blocks should be inserted.
 */
function gapInsertIndex(
	state: EditorState,
	sel: GapCursorSelection,
): { parentPath: BlockId[]; insertIndex: number } | null {
	const path = findNodePath(state.doc, sel.blockId);
	if (!path) return null;

	const parentPath: BlockId[] = extractParentPath(path);
	const siblings = getSiblings(state, parentPath);

	const index: number = findSiblingIndex(siblings, sel.blockId);
	if (index < 0) return null;

	const insertIndex: number = sel.side === 'before' ? index : index + 1;
	return { parentPath, insertIndex };
}

/** Pastes one or more blocks at a GapCursor position. */
function pasteBlocksAtGap(
	state: EditorState,
	sel: GapCursorSelection,
	blocks: readonly SliceBlock[],
): Transaction {
	const gap = gapInsertIndex(state, sel);
	if (!gap) {
		return state.transaction('paste').setSelection(sel).build();
	}

	const builder: TransactionBuilder = state.transaction('paste');
	insertSliceBlocks(builder, gap.parentPath, gap.insertIndex, blocks);
	return builder.build();
}

/** Inserts an intact slice at a resolved sibling position and selects its end. */
function insertSliceBlocks(
	builder: TransactionBuilder,
	parentPath: readonly BlockId[],
	insertIndex: number,
	blocks: readonly SliceBlock[],
): void {
	let insertAt: number = insertIndex;
	let lastBlockId: BlockId | undefined;
	let lastLen = 0;

	for (const block of blocks) {
		const newId: BlockId = generateBlockId();
		const newBlock = createBlockNode(
			block.type,
			segmentsToInlineChildren(block.segments),
			newId,
			block.attrs,
		);
		builder.insertNode(parentPath, insertAt, newBlock);
		insertAt++;
		lastBlockId = newId;
		lastLen = segmentsLength(block.segments);
	}

	if (lastBlockId) {
		builder.setSelection(createCollapsedSelection(lastBlockId, lastLen));
	}
}
