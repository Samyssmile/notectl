/**
 * Handles paste of rich block data: internal clipboard (RichBlockData)
 * and application/x-notectl-block JSON.
 *
 * Resolves insertion context (root or table cell) and builds paste transactions.
 */

import {
	type InsertionContext,
	createBlockFromRichData,
	findTableCellAncestor,
	resolveCellInsertionContext,
	resolveRootInsertionContext,
	sanitizeAttrs,
	validateRichBlockData,
} from '../commands/BlockInsertion.js';
import { addDeleteSelectionSteps } from '../commands/Commands.js';
import {
	type BlockAttrs,
	type BlockNode,
	createBlockNode,
	generateBlockId,
} from '../model/Document.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
	isTextSelection,
} from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import { nodeType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';
import type { RichBlockData } from './InternalClipboard.js';

export class PasteRichBlockHandler {
	constructor(
		private readonly getState: GetStateFn,
		private readonly dispatch: DispatchFn,
		private readonly schemaRegistry?: SchemaRegistry,
	) {}

	/** Handles paste of an internal block node from ClipboardHandler. */
	handleBlockPaste(json: string): void {
		let parsed: { type?: string; attrs?: Record<string, unknown> };
		try {
			parsed = JSON.parse(json) as { type?: string; attrs?: Record<string, unknown> };
		} catch {
			return;
		}

		const typeName: string | undefined = parsed.type;
		if (!typeName) return;

		const spec = this.schemaRegistry?.getNodeSpec(typeName);
		if (this.schemaRegistry && !spec) return;

		const state = this.getState();
		const sel = state.selection;
		const anchorBlockId: BlockId = isNodeSelection(sel)
			? sel.nodeId
			: isGapCursor(sel)
				? sel.blockId
				: sel.anchor.blockId;

		const newBlockId: BlockId = generateBlockId();
		const attrs: BlockAttrs | undefined = sanitizeAttrs(parsed.attrs, spec?.attrs) as
			| BlockAttrs
			| undefined;
		const newBlock: BlockNode = createBlockNode(
			nodeType(typeName) as NodeTypeName,
			undefined,
			newBlockId,
			attrs,
		);

		// Table cell: insert as last child
		const cellId: BlockId | undefined = findTableCellAncestor(state, anchorBlockId);
		if (cellId) {
			const ctx = resolveCellInsertionContext(state, anchorBlockId, cellId, this.schemaRegistry);
			if (!ctx) return;
			const cell: BlockNode | undefined = state.getBlock(cellId);
			if (!cell) return;

			const builder = state.transaction('paste');
			builder.insertNode(ctx.parentPath, cell.children.length, newBlock);
			builder.setSelection(createNodeSelection(newBlockId, [...ctx.parentPath, newBlockId]));
			this.dispatch(builder.build());
			return;
		}

		// Root: insert after anchor
		const ctx = resolveRootInsertionContext(state, anchorBlockId, this.schemaRegistry);
		if (!ctx) return;

		const insertOffset: number = isGapCursor(sel) && sel.side === 'before' ? 0 : 1;
		const builder = state.transaction('paste');
		builder.insertNode(ctx.parentPath, ctx.anchorIndex + insertOffset, newBlock);
		builder.setSelection(createNodeSelection(newBlockId, [...ctx.parentPath, newBlockId]));
		this.dispatch(builder.build());
	}

	/** Parses JSON and delegates to handleRichPaste (for HTML-embedded data). */
	handleRichPasteFromJson(json: string): boolean {
		let blocks: RichBlockData[];
		try {
			blocks = JSON.parse(json) as RichBlockData[];
		} catch {
			return false;
		}
		if (!Array.isArray(blocks) || blocks.length === 0) return false;
		return this.handleRichPaste(blocks);
	}

	/**
	 * Handles paste of rich block data (text selections carrying block structure).
	 * Returns true if handled, false to fall through to plain-text paste.
	 */
	handleRichPaste(blocks: readonly RichBlockData[]): boolean {
		if (blocks.length === 0) return false;

		const hasStructured: boolean = blocks.some(
			(b) =>
				(b.type !== undefined && b.type !== 'paragraph') ||
				b.segments?.some((segment) => segment.kind === 'inline'),
		);
		if (!hasStructured && blocks.length <= 1) return false;

		let state = this.getState();
		const sel = state.selection;

		if (isTextSelection(sel) && !isCollapsed(sel)) {
			const delBuilder = state.transaction('paste');
			const landingId: BlockId | undefined = addDeleteSelectionSteps(state, delBuilder);
			const delTr = delBuilder.build();
			this.dispatch(delTr);
			state = state.apply(delTr);
			if (landingId) {
				return this.resolveAndInsertRichBlocks(blocks, state, landingId);
			}
		}

		const anchorBlockId: BlockId = isNodeSelection(sel)
			? sel.nodeId
			: isGapCursor(sel)
				? sel.blockId
				: sel.anchor.blockId;

		return this.resolveAndInsertRichBlocks(blocks, state, anchorBlockId);
	}

	/** Resolves insertion context (cell or root) and inserts rich blocks. */
	private resolveAndInsertRichBlocks(
		blocks: readonly RichBlockData[],
		state: EditorState,
		anchorBlockId: BlockId,
	): boolean {
		const sel = state.selection;
		const cellId: BlockId | undefined = findTableCellAncestor(state, anchorBlockId);

		if (cellId) {
			const ctx = resolveCellInsertionContext(state, anchorBlockId, cellId, this.schemaRegistry);
			if (!ctx) return false;
			const cell: BlockNode | undefined = state.getBlock(cellId);
			const startIndex: number =
				ctx.anchorIndex >= 0 ? ctx.anchorIndex + 1 : (cell?.children.length ?? 0);
			return this.insertRichBlocks(blocks, state, ctx, startIndex, true);
		}

		const ctx = resolveRootInsertionContext(state, anchorBlockId, this.schemaRegistry);
		if (!ctx) return false;
		const insertOffset: number = isGapCursor(sel) && sel.side === 'before' ? 0 : 1;
		return this.insertRichBlocks(
			blocks,
			state,
			ctx,
			ctx.anchorIndex + insertOffset,
			!isGapCursor(sel),
		);
	}

	/** Inserts validated rich blocks at the resolved position. */
	private insertRichBlocks(
		blocks: readonly RichBlockData[],
		state: EditorState,
		context: InsertionContext,
		startIndex: number,
		removeEmptyAnchor: boolean,
	): boolean {
		const builder = state.transaction('paste');
		let insertIndex: number = startIndex;
		let lastBlockId: BlockId | undefined;
		let lastTextLen = 0;

		for (const raw of blocks) {
			const blockData = validateRichBlockData(raw, this.schemaRegistry);
			if (!blockData) continue;

			const newBlock: BlockNode = createBlockFromRichData(blockData);
			builder.insertNode(context.parentPath, insertIndex, newBlock);
			insertIndex++;
			lastBlockId = newBlock.id;
			lastTextLen = (blockData.text ?? '').length;
		}

		if (removeEmptyAnchor && context.isAnchorEmpty && context.anchorIndex >= 0) {
			builder.removeNode(context.parentPath, context.anchorIndex);
		}

		if (lastBlockId) {
			builder.setSelection(createCollapsedSelection(lastBlockId, lastTextLen));
		}

		this.dispatch(builder.build());
		return true;
	}
}
