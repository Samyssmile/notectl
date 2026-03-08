/**
 * Block insertion utilities for paste and clipboard operations.
 *
 * Provides context resolution (parent path, anchor index, empty detection)
 * for inserting blocks into the document tree — both at root level and
 * inside table cells. Also contains pure helpers for block cloning,
 * recursive lookup, and attribute sanitization against a NodeSpec.
 */

import {
	type BlockAttrs,
	type BlockNode,
	type ChildNode,
	type InlineNode,
	type Mark,
	type TextNode,
	createBlockNode,
	createInlineNode,
	createTextNode,
	generateBlockId,
	getBlockText,
	isBlockNode,
} from '../model/Document.js';
import { findNodePath } from '../model/NodeResolver.js';
import type { AttrSpec } from '../model/NodeSpec.js';
import type { RichBlockData, RichSegment } from '../model/RichBlockData.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { EditorSelection } from '../model/Selection.js';
import { isGapCursor, isNodeSelection } from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import { inlineType, nodeType } from '../model/TypeBrands.js';
import type { EditorState } from '../state/EditorState.js';
import type { TransactionBuilder } from '../state/Transaction.js';
import { extractParentPath, findSiblingIndex, getSiblings } from './CommandHelpers.js';

/**
 * Resolved insertion target within the document tree.
 * Contains everything needed to insert blocks at a specific anchor position.
 */
export interface InsertionContext {
	readonly parentPath: readonly BlockId[];
	readonly anchorIndex: number;
	readonly isAnchorEmpty: boolean;
}

/**
 * Resolves an insertion context for root-level (or nested-parent-level) insertion.
 * Computes the parent path, anchor index among siblings, and whether the anchor is empty.
 */
export function resolveRootInsertionContext(
	state: EditorState,
	anchorBlockId: BlockId,
	schemaRegistry?: SchemaRegistry,
): InsertionContext | undefined {
	const path: readonly string[] | undefined = findNodePath(state.doc, anchorBlockId);
	const parentPath: BlockId[] = extractParentPath(path);

	const siblings: readonly ChildNode[] = getSiblings(state, parentPath);
	const anchorIndex: number = findSiblingIndex(siblings, anchorBlockId);
	if (anchorIndex < 0) return undefined;

	const isAnchorEmpty: boolean = isBlockEmpty(state, anchorBlockId, schemaRegistry);
	return { parentPath, anchorIndex, isAnchorEmpty };
}

/**
 * Resolves an insertion context within a table cell.
 * The parent path points to the cell itself; siblings are the cell's children.
 */
export function resolveCellInsertionContext(
	state: EditorState,
	anchorBlockId: BlockId,
	cellId: BlockId,
	schemaRegistry?: SchemaRegistry,
): InsertionContext | undefined {
	const cellPath: BlockId[] | undefined = findNodePath(state.doc, cellId) as BlockId[] | undefined;
	if (!cellPath) return undefined;

	const cell: BlockNode | undefined = state.getBlock(cellId);
	if (!cell) return undefined;

	const anchorIndex: number = cell.children.findIndex(
		(c) => isBlockNode(c) && c.id === anchorBlockId,
	);

	const isAnchorEmpty: boolean = isBlockEmpty(state, anchorBlockId, schemaRegistry);
	return { parentPath: cellPath, anchorIndex, isAnchorEmpty };
}

/**
 * Finds a table_cell ancestor for the given block.
 * Walks the node path upward, returning the first table_cell BlockId found.
 */
export function findTableCellAncestor(state: EditorState, blockId: BlockId): BlockId | undefined {
	const block: BlockNode | undefined = state.getBlock(blockId);
	if (block?.type === 'table_cell') return blockId;

	const path: BlockId[] | undefined = findNodePath(state.doc, blockId) as BlockId[] | undefined;
	if (!path) return undefined;

	for (const id of path) {
		const node: BlockNode | undefined = state.getBlock(id as BlockId);
		if (node?.type === 'table_cell') return id as BlockId;
	}
	return undefined;
}

/**
 * Resolves the anchor block ID from the current editor selection.
 * Handles text selection, node selection, and gap cursor uniformly.
 */
export function resolveAnchorBlockId(selection: EditorSelection): BlockId {
	if (isNodeSelection(selection)) return selection.nodeId;
	if (isGapCursor(selection)) return selection.blockId;
	return selection.anchor.blockId;
}

/**
 * Inserts a block node after the anchor position, resolving cell vs root context.
 * Removes the anchor block if it is empty (matching standard paste behavior).
 * Returns true on success, false if context resolution fails.
 */
export function insertBlockAfterAnchor(
	state: EditorState,
	builder: TransactionBuilder,
	anchorBlockId: BlockId,
	block: BlockNode,
	selection: EditorSelection,
	schemaRegistry?: SchemaRegistry,
): boolean {
	const cellId: BlockId | undefined = findTableCellAncestor(state, anchorBlockId);

	if (cellId) {
		const ctx: InsertionContext | undefined = resolveCellInsertionContext(
			state,
			anchorBlockId,
			cellId,
			schemaRegistry,
		);
		if (!ctx) return false;

		const insertIndex: number = ctx.anchorIndex + 1;
		builder.insertNode(ctx.parentPath, insertIndex, block);

		if (ctx.isAnchorEmpty && ctx.anchorIndex >= 0) {
			builder.removeNode(ctx.parentPath, ctx.anchorIndex);
		}
	} else {
		const ctx: InsertionContext | undefined = resolveRootInsertionContext(
			state,
			anchorBlockId,
			schemaRegistry,
		);
		if (!ctx) return false;

		const insertOffset: number = isGapCursor(selection) && selection.side === 'before' ? 0 : 1;
		builder.insertNode(ctx.parentPath, ctx.anchorIndex + insertOffset, block);

		if (ctx.isAnchorEmpty && !isGapCursor(selection)) {
			builder.removeNode(ctx.parentPath, ctx.anchorIndex);
		}
	}

	return true;
}

/** Recursively clones a block tree, assigning new IDs to all block nodes. */
export function cloneBlockWithNewIds(block: BlockNode, newId: BlockId): BlockNode {
	const children = block.children.map((child) => {
		if (isBlockNode(child)) {
			return cloneBlockWithNewIds(child, generateBlockId());
		}
		return child;
	});
	return createBlockNode(block.type, children, newId, block.attrs);
}

/** Recursively searches a block tree for a block with the given ID (DFS). */
export function findBlockRecursive(block: BlockNode, blockId: BlockId): BlockNode | undefined {
	if (block.id === blockId) return block;
	for (const child of block.children) {
		if (!isBlockNode(child)) continue;
		const found: BlockNode | undefined = findBlockRecursive(child, blockId);
		if (found) return found;
	}
	return undefined;
}

/**
 * Validates incoming attributes against the declared AttrSpec.
 * Only keys declared in the spec are kept; non-primitive values fall back to defaults.
 */
export function sanitizeAttrs(
	incoming: Record<string, unknown> | undefined,
	specAttrs: Readonly<Record<string, AttrSpec>> | undefined,
): Record<string, string | number | boolean> | undefined {
	if (!specAttrs) return undefined;

	const result: Record<string, string | number | boolean> = {};
	let hasKeys = false;

	for (const key of Object.keys(specAttrs)) {
		const spec: AttrSpec = specAttrs[key] as AttrSpec;
		const raw: unknown = incoming?.[key];

		if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
			result[key] = raw;
		} else if (spec.default !== undefined) {
			result[key] = spec.default;
		}
		if (key in result) hasKeys = true;
	}

	return hasKeys ? result : undefined;
}

/** Checks whether a block is empty (has no text and is not a void block). */
function isBlockEmpty(
	state: EditorState,
	blockId: BlockId,
	schemaRegistry?: SchemaRegistry,
): boolean {
	const block: BlockNode | undefined = state.getBlock(blockId);
	if (!block) return false;

	const spec = schemaRegistry?.getNodeSpec(block.type);
	return !spec?.isVoid && getBlockText(block) === '';
}

// --- Rich block creation ---

/**
 * Validates a rich block against the schema registry.
 * Returns undefined for blocks with unknown types; sanitizes attributes
 * against the declared spec.
 */
export function validateRichBlockData(
	raw: RichBlockData,
	schemaRegistry?: SchemaRegistry,
): RichBlockData | undefined {
	if (!raw.type) return undefined;
	if (!schemaRegistry) return raw;

	const spec = schemaRegistry.getNodeSpec(raw.type);
	if (!spec) return undefined;

	const attrs: Record<string, string | number | boolean> | undefined = sanitizeAttrs(
		raw.attrs,
		spec.attrs,
	);
	const segments: RichSegment[] | undefined = raw.segments
		? sanitizeRichSegments(raw.segments, schemaRegistry)
		: undefined;
	return {
		...raw,
		...(attrs ? { attrs } : {}),
		...(segments ? { segments } : raw.segments ? { segments: [] } : {}),
	};
}

/**
 * Creates a BlockNode from validated rich block data.
 * Converts segments or plain text into inline children.
 */
export function createBlockFromRichData(blockData: RichBlockData): BlockNode {
	const newId: BlockId = generateBlockId();
	const text: string = blockData.text ?? '';
	const children: readonly (TextNode | InlineNode)[] | undefined = createChildrenFromRichBlock(
		blockData,
		text,
	);
	const attrs: BlockAttrs | undefined = blockData.attrs
		? (blockData.attrs as BlockAttrs)
		: undefined;

	return createBlockNode(nodeType(blockData.type) as NodeTypeName, children, newId, attrs);
}

/**
 * Creates inline children from rich block data.
 * Uses mark-preserving segments when available, falls back to plain text.
 */
function createChildrenFromRichBlock(
	blockData: RichBlockData,
	text: string,
): readonly (TextNode | InlineNode)[] | undefined {
	if (blockData.segments && blockData.segments.length > 0) {
		return createChildrenFromSegments(blockData.segments);
	}
	return text ? [createTextNode(text)] : undefined;
}

/** Converts rich segments into TextNode children with marks. */
function createChildrenFromSegments(
	segments: readonly RichSegment[],
): readonly (TextNode | InlineNode)[] {
	const children: (TextNode | InlineNode)[] = [];
	for (const seg of segments) {
		if (seg.kind === 'inline') {
			children.push(
				createInlineNode(
					inlineType(seg.inlineType),
					seg.attrs as Readonly<Record<string, string | number | boolean>> | undefined,
				),
			);
			continue;
		}
		if (seg.text.length === 0) continue;
		const marks: readonly Mark[] = seg.marks.map((m) => ({
			type: m.type as Mark['type'],
			...(m.attrs ? { attrs: m.attrs as Mark['attrs'] } : {}),
		}));
		children.push(createTextNode(seg.text, marks));
	}
	return children;
}

function sanitizeRichSegments(
	segments: readonly RichSegment[],
	schemaRegistry: SchemaRegistry,
): RichSegment[] {
	const sanitized: RichSegment[] = [];
	for (const segment of segments) {
		if (segment.kind === 'inline') {
			const spec = schemaRegistry.getInlineNodeSpec(segment.inlineType);
			if (!spec) continue;
			const attrs = sanitizeAttrs(segment.attrs, spec.attrs);
			sanitized.push({
				kind: 'inline',
				inlineType: segment.inlineType,
				...(attrs ? { attrs } : {}),
			});
			continue;
		}
		sanitized.push(segment);
	}
	return sanitized;
}
