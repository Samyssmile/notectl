/**
 * Handles paste of rich block data: internal clipboard (RichBlockData)
 * and application/x-notectl-block JSON.
 *
 * Resolves insertion context (root or table cell) and builds paste transactions.
 */

import {
	type InsertionContext,
	canContainerHoldBlocks,
	createBlockFromRichData,
	findTableCellAncestor,
	resolveAnchorBlockId,
	resolveCellInsertionContext,
	resolveRootEscapeContext,
	resolveRootInsertionContext,
	richBlocksToSlice,
	sanitizeAttrs,
	validateRichBlockData,
} from '../commands/BlockInsertion.js';
import { addDeleteSelectionSteps } from '../commands/Commands.js';
import { pasteSlice } from '../commands/PasteCommand.js';
import {
	type BlockAttrs,
	type BlockNode,
	createBlockNode,
	generateBlockId,
	getBlockLength,
} from '../model/Document.js';
import { normalizeHTMLId } from '../model/HTMLUtils.js';
import type { RichBlockData } from '../model/RichBlockData.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	isGapCursor,
	isTextSelection,
} from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import { nodeType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';

export class PasteRichBlockHandler {
	constructor(
		private readonly getState: GetStateFn,
		private readonly dispatch: DispatchFn,
		private readonly schemaRegistry?: SchemaRegistry,
	) {}

	/** Handles paste of an internal block node from ClipboardHandler. */
	handleBlockPaste(json: string): void {
		let parsed: { type?: string; htmlId?: unknown; attrs?: Record<string, unknown> };
		try {
			parsed = JSON.parse(json) as {
				type?: string;
				htmlId?: unknown;
				attrs?: Record<string, unknown>;
			};
		} catch {
			return;
		}

		const typeName: string | undefined = parsed.type;
		if (!typeName) return;

		const spec = this.schemaRegistry?.getNodeSpec(typeName);
		if (this.schemaRegistry && !spec) return;

		const state = this.getState();
		const sel = state.selection;
		const anchorBlockId: BlockId = resolveAnchorBlockId(sel);

		const newBlockId: BlockId = generateBlockId();
		const attrs: BlockAttrs | undefined = sanitizeAttrs(parsed.attrs, spec?.attrs) as
			| BlockAttrs
			| undefined;
		const newBlock: BlockNode = createBlockNode(
			nodeType(typeName) as NodeTypeName,
			undefined,
			newBlockId,
			attrs,
			normalizeHTMLId(parsed.htmlId),
		);

		// Table cell: insert as last child, unless the cell's content rule forbids
		// the block type (e.g. a math_display copied into a cell). When it does not
		// fit, escape to the document root after the outer table rather than nesting
		// schema-invalidly — mirrors the HTML paste guard (#166).
		const cellId: BlockId | undefined = findTableCellAncestor(state, anchorBlockId);
		if (cellId) {
			const cell: BlockNode | undefined = state.getBlock(cellId);
			if (this.cellRejects(cell, [newBlock])) {
				const escapeCtx = resolveRootEscapeContext(state, anchorBlockId);
				if (!escapeCtx) return;
				this.dispatchNodeInsert(state, escapeCtx.parentPath, escapeCtx.anchorIndex + 1, newBlock);
				return;
			}

			const ctx = resolveCellInsertionContext(state, anchorBlockId, cellId, this.schemaRegistry);
			if (!ctx || !cell) return;
			this.dispatchNodeInsert(state, ctx.parentPath, cell.children.length, newBlock);
			return;
		}

		// Root: insert after anchor
		const ctx = resolveRootInsertionContext(state, anchorBlockId, this.schemaRegistry);
		if (!ctx) return;

		const insertOffset: number = isGapCursor(sel) && sel.side === 'before' ? 0 : 1;
		this.dispatchNodeInsert(state, ctx.parentPath, ctx.anchorIndex + insertOffset, newBlock);
	}

	/** Inserts a single block at the position and node-selects it. */
	private dispatchNodeInsert(
		state: EditorState,
		parentPath: readonly BlockId[],
		index: number,
		block: BlockNode,
	): void {
		const builder = state.transaction('paste');
		builder.insertNode(parentPath, index, block);
		builder.setSelection(createNodeSelection(block.id, [...parentPath, block.id]));
		this.dispatch(builder.build());
	}

	/**
	 * True when the container's content rule forbids any of the given blocks, so
	 * the paste must not nest them there. Undefined cell or absent registry cannot
	 * be checked, so they are treated as accepting (graceful degradation).
	 */
	private cellRejects(cell: BlockNode | undefined, blocks: readonly BlockNode[]): boolean {
		if (!cell || !this.schemaRegistry) return false;
		return !canContainerHoldBlocks(this.schemaRegistry, cell.type, blocks);
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
				b.htmlId !== undefined ||
				(b.type !== undefined && b.type !== 'paragraph') ||
				b.segments?.some((segment) => segment.kind === 'inline'),
		);
		if (!hasStructured && blocks.length <= 1) return false;

		let state = this.getState();
		const sel = state.selection;
		const anchorBlockId: BlockId = resolveAnchorBlockId(sel);

		// The canonical split-insert-merge paste strategy (PasteCommand) splits the
		// caret block at the offset and merges the boundary fragments back in, which
		// is what restores a cross-block cut/paste round-trip (#165). It only fits a
		// collapsed caret in a NON-EMPTY block at the document root:
		//  - an empty anchor has no content to split, so whole-block insertion below
		//    (which removes the empty anchor and drops the clipboard blocks verbatim)
		//    round-trips more faithfully and preserves their block types;
		//  - the strategy inserts middle blocks at the document root keyed by flat
		//    block order, so a nested anchor (table cell, blockquote) is out of reach;
		//  - node selections and gap cursors have no text caret to split.
		const anchorBlock: BlockNode | undefined = state.getBlock(anchorBlockId);
		const isRootChild: boolean = state.doc.children.some((c) => c.id === anchorBlockId);
		const carriesHTMLId: boolean = blocks.some((block) => normalizeHTMLId(block.htmlId));
		const splitsAtCaret: boolean =
			!carriesHTMLId &&
			isTextSelection(sel) &&
			isCollapsed(sel) &&
			isRootChild &&
			anchorBlock !== undefined &&
			getBlockLength(anchorBlock) > 0;
		if (splitsAtCaret) {
			this.dispatch(pasteSlice(state, richBlocksToSlice(blocks, this.schemaRegistry)));
			return true;
		}

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

		return this.resolveAndInsertRichBlocks(blocks, state, anchorBlockId);
	}

	/**
	 * Validates and builds the clipboard blocks, resolves the insertion context
	 * (cell or root), and inserts them. When the caret is in a table cell whose
	 * content rule forbids one of the blocks (e.g. a copied code_block, which is a
	 * leaf block not in the cell's allow-list), the whole run escapes to the
	 * document root after the outer table instead of nesting schema-invalidly. This
	 * mirrors the HTML paste guard (#166) for the internal-copy path.
	 *
	 * Blocks built here are always leaf blocks (rich clipboard data carries inline
	 * children only), so the trailing collapsed caret in {@link insertNodes} is
	 * always valid.
	 */
	private resolveAndInsertRichBlocks(
		blocks: readonly RichBlockData[],
		state: EditorState,
		anchorBlockId: BlockId,
	): boolean {
		const nodes: BlockNode[] = [];
		for (const raw of blocks) {
			const blockData: RichBlockData | undefined = validateRichBlockData(raw, this.schemaRegistry);
			if (blockData) nodes.push(createBlockFromRichData(blockData));
		}
		if (nodes.length === 0) return false;

		const sel = state.selection;
		const cellId: BlockId | undefined = findTableCellAncestor(state, anchorBlockId);

		if (cellId) {
			const cell: BlockNode | undefined = state.getBlock(cellId);
			if (this.cellRejects(cell, nodes)) {
				const escapeCtx: InsertionContext | undefined = resolveRootEscapeContext(
					state,
					anchorBlockId,
				);
				if (!escapeCtx) return false;
				return this.insertNodes(nodes, state, escapeCtx, escapeCtx.anchorIndex + 1, false);
			}

			const ctx = resolveCellInsertionContext(state, anchorBlockId, cellId, this.schemaRegistry);
			if (!ctx) return false;
			const startIndex: number =
				ctx.anchorIndex >= 0 ? ctx.anchorIndex + 1 : (cell?.children.length ?? 0);
			return this.insertNodes(nodes, state, ctx, startIndex, true);
		}

		const ctx = resolveRootInsertionContext(state, anchorBlockId, this.schemaRegistry);
		if (!ctx) return false;
		const insertOffset: number = isGapCursor(sel) && sel.side === 'before' ? 0 : 1;
		return this.insertNodes(nodes, state, ctx, ctx.anchorIndex + insertOffset, !isGapCursor(sel));
	}

	/** Inserts pre-built block nodes at the resolved position. */
	private insertNodes(
		nodes: readonly BlockNode[],
		state: EditorState,
		context: InsertionContext,
		startIndex: number,
		removeEmptyAnchor: boolean,
	): boolean {
		const builder = state.transaction('paste');
		let insertIndex: number = startIndex;
		let lastBlock: BlockNode | undefined;

		for (const node of nodes) {
			builder.insertNode(context.parentPath, insertIndex, node);
			insertIndex++;
			lastBlock = node;
		}

		if (removeEmptyAnchor && context.isAnchorEmpty && context.anchorIndex >= 0) {
			builder.removeNode(context.parentPath, context.anchorIndex);
		}

		if (lastBlock) {
			builder.setSelection(createCollapsedSelection(lastBlock.id, getBlockLength(lastBlock)));
		}

		this.dispatch(builder.build());
		return true;
	}
}
