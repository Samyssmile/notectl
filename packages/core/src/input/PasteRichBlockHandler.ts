/**
 * Handles paste of rich block data: internal clipboard (RichBlockData)
 * and application/x-notectl-block JSON.
 *
 * Resolves the insertion target through the shared selection replacement
 * (SelectionReplacement) and builds paste transactions.
 */

import {
	createBlockFromRichData,
	insertBlocksAfterAnchor,
	resolveAnchorBlockId,
	richBlocksToSlice,
	sanitizeAttrs,
	validateRichBlockData,
} from '../commands/BlockInsertion.js';
import { pasteSlice } from '../commands/PasteCommand.js';
import {
	type ReplacementTarget,
	resolveReplacementTarget,
} from '../commands/SelectionReplacement.js';
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
	type EditorSelection,
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	isTextSelection,
} from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import { nodeType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { TransactionBuilder } from '../state/Transaction.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';

export class PasteRichBlockHandler {
	constructor(
		private readonly getState: GetStateFn,
		private readonly dispatch: DispatchFn,
		private readonly schemaRegistry?: SchemaRegistry,
	) {}

	/**
	 * Handles paste of an internal block node from ClipboardHandler. Like every
	 * whole-block paste, it replaces a range selection and lands beside the
	 * receiving block under its actual parent, or after the outermost container
	 * when that parent's content rule forbids the block (#166, #267). The pasted
	 * block ends up node-selected.
	 */
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

		const attrs: BlockAttrs | undefined = sanitizeAttrs(parsed.attrs, spec?.attrs) as
			| BlockAttrs
			| undefined;
		const newBlock: BlockNode = createBlockNode(
			nodeType(typeName) as NodeTypeName,
			undefined,
			generateBlockId(),
			attrs,
			normalizeHTMLId(parsed.htmlId),
		);

		const state: EditorState = this.getState();
		const builder: TransactionBuilder = state.transaction('paste');
		const target: ReplacementTarget = resolveReplacementTarget(state, builder);
		const parentPath: readonly BlockId[] | undefined = insertBlocksAfterAnchor(
			target.state,
			builder,
			target.blockId,
			[newBlock],
			state.selection,
			this.schemaRegistry,
		);
		if (!parentPath) return;

		builder.setSelection(createNodeSelection(newBlock.id, [...parentPath, newBlock.id]));
		this.dispatch(builder.build());
	}

	/** Parses JSON and delegates to handleRichPaste (for HTML-embedded data). */
	handleRichPasteFromJson(json: string, state?: EditorState): boolean {
		let blocks: RichBlockData[];
		try {
			blocks = JSON.parse(json) as RichBlockData[];
		} catch {
			return false;
		}
		if (!Array.isArray(blocks) || blocks.length === 0) return false;
		return this.handleRichPaste(blocks, state);
	}

	/**
	 * Handles paste of rich block data (text selections carrying block structure).
	 * Returns true if handled, false to fall through to plain-text paste.
	 */
	handleRichPaste(blocks: readonly RichBlockData[], initialState?: EditorState): boolean {
		if (blocks.length === 0) return false;
		const validatedBlocks: RichBlockData[] = [];
		for (const raw of blocks) {
			const block: RichBlockData | undefined = validateRichBlockData(raw, this.schemaRegistry);
			if (block) validatedBlocks.push(block);
		}
		if (validatedBlocks.length === 0) return false;

		const hasStructured: boolean = validatedBlocks.some(
			(b) =>
				b.htmlId !== undefined ||
				(b.type !== undefined && b.type !== 'paragraph') ||
				b.segments?.some((segment) => segment.kind === 'inline'),
		);
		if (!hasStructured && validatedBlocks.length <= 1) return false;

		const state: EditorState = initialState ?? this.getState();
		const sel = state.selection;
		const anchorBlockId: BlockId = resolveAnchorBlockId(sel);

		// Multiple text leaves share the slice strategy at a caret or range in any
		// container. It owns deletion, insertion and selection in one transaction.
		// Neutral paragraphs keep the receiving block's type even when it is empty
		// (notably a list item). Semantic IDs and structural/void blocks retain
		// whole-block insertion. Preserve the existing single-block root behavior.
		const anchorBlock: BlockNode | undefined = state.getBlock(anchorBlockId);
		const isRootChild: boolean = state.doc.children.some((c) => c.id === anchorBlockId);
		const carriesHTMLId: boolean = validatedBlocks.some((block) => normalizeHTMLId(block.htmlId));
		const textLeaves: boolean = validatedBlocks.every((block) => {
			const spec =
				this.schemaRegistry?.getNodeSpec(block.type) ?? state.schema.getNodeSpec?.(block.type);
			return !spec?.isVoid && (!spec?.content || spec.content.allow.includes('text'));
		});
		const splitsAtCaret: boolean =
			!carriesHTMLId &&
			textLeaves &&
			isTextSelection(sel) &&
			(validatedBlocks.length > 1 ||
				(isCollapsed(sel) &&
					isRootChild &&
					anchorBlock !== undefined &&
					getBlockLength(anchorBlock) > 0));
		if (splitsAtCaret) {
			this.dispatch(pasteSlice(state, richBlocksToSlice(validatedBlocks)));
			return true;
		}

		// Deletion and insertion share one transaction, so nothing is dispatched
		// when the insertion cannot be resolved and the caller may fall back.
		const builder: TransactionBuilder = state.transaction('paste');
		const target: ReplacementTarget = resolveReplacementTarget(state, builder);
		return this.resolveAndInsertRichBlocks(validatedBlocks, builder, target, sel);
	}

	/**
	 * Inserts validated clipboard blocks beside the caret under its actual parent.
	 * If that parent forbids any block, the complete run escapes after the
	 * outermost container, using the same context as HTML and Smart Paste (#166).
	 *
	 * Blocks built here are always leaf blocks (rich clipboard data carries inline
	 * children only), so the trailing collapsed caret is
	 * always valid.
	 */
	private resolveAndInsertRichBlocks(
		blocks: readonly RichBlockData[],
		builder: TransactionBuilder,
		target: ReplacementTarget,
		sel: EditorSelection,
	): boolean {
		const nodes: BlockNode[] = blocks.map(createBlockFromRichData);
		const { state, blockId: anchorBlockId } = target;
		if (!insertBlocksAfterAnchor(state, builder, anchorBlockId, nodes, sel, this.schemaRegistry)) {
			return false;
		}

		const lastBlock = nodes[nodes.length - 1];
		if (lastBlock) {
			builder.setSelection(createCollapsedSelection(lastBlock.id, getBlockLength(lastBlock)));
		}

		this.dispatch(builder.build());
		return true;
	}
}
