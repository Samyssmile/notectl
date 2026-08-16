/**
 * Immutable editor state container.
 * Every mutation produces a new EditorState instance.
 */

import {
	type BlockNode,
	type ChildNode,
	type Document,
	type Mark,
	cloneDocument,
	cloneMarks,
	createDocument,
	freezeDocument,
	freezeMarks,
	getBlockLength,
	isBlockNode,
	isLeafBlock,
} from '../model/Document.js';
import { findNode, findNodePath } from '../model/NodeResolver.js';
import type { Schema } from '../model/Schema.js';
import { defaultSchema } from '../model/Schema.js';
import type { EditorSelection, Position } from '../model/Selection.js';
import {
	cloneEditorSelection,
	createCollapsedSelection,
	createPosition,
	createSelection,
	freezeEditorSelection,
	isGapCursor,
	isNodeSelection,
} from '../model/Selection.js';
import { type BlockId, blockId } from '../model/TypeBrands.js';
import { applyStep } from './StepHandlers.js';
import type { Transaction } from './Transaction.js';
import { TransactionBuilder } from './Transaction.js';

export class EditorState {
	readonly doc: Document;
	readonly selection: EditorSelection;
	readonly storedMarks: readonly Mark[] | null;
	readonly schema: Schema;

	private _blockMap: Map<BlockId, BlockNode> | null = null;
	private _blockOrder: readonly BlockId[] | null = null;

	private constructor(
		doc: Document,
		selection: EditorSelection,
		storedMarks: readonly Mark[] | null,
		schema: Schema,
	) {
		this.doc = freezeDocument(doc);
		this.selection = freezeEditorSelection(selection);
		if (storedMarks) {
			const ownedMarks = cloneMarks(storedMarks);
			freezeMarks(ownedMarks);
			this.storedMarks = ownedMarks;
		} else {
			this.storedMarks = null;
		}
		this.schema = schema;
	}

	/** Creates a new EditorState with default document. */
	static create(options?: {
		doc?: Document;
		selection?: EditorSelection;
		schema?: Schema;
	}): EditorState {
		const schema = options?.schema ?? defaultSchema();
		const doc = options?.doc ? cloneDocument(options.doc) : createDocument();
		const firstLeaf = findFirstLeafBlock(doc.children);
		const selection = options?.selection
			? validateSelection(doc, cloneEditorSelection(options.selection))
			: createCollapsedSelection(firstLeaf ? firstLeaf.id : blockId(''), 0);

		return new EditorState(doc, selection, null, schema);
	}

	/** Creates a TransactionBuilder from this state. */
	transaction(
		origin: 'input' | 'paste' | 'command' | 'history' | 'api' = 'api',
	): TransactionBuilder {
		return new TransactionBuilder(this.selection, this.storedMarks, origin, this.doc);
	}

	/** Applies a transaction and returns a new EditorState. */
	apply(tr: Transaction): EditorState {
		let doc = this.doc;

		for (const step of tr.steps) {
			doc = applyStep(doc, step);
		}

		const selection = validateSelection(doc, cloneEditorSelection(tr.selectionAfter));
		return new EditorState(doc, selection, tr.storedMarksAfter, this.schema);
	}

	/** Finds a block by its ID anywhere in the tree. Uses a lazy-built Map for O(1) lookup. */
	getBlock(blockId: BlockId): BlockNode | undefined {
		this._blockMap ??= buildBlockMap(this.doc);
		return this._blockMap.get(blockId);
	}

	/** Returns leaf-block IDs in depth-first order. Cached after first call. */
	getBlockOrder(): readonly BlockId[] {
		this._blockOrder ??= buildBlockOrder(this.doc);
		return this._blockOrder;
	}

	/** Returns the path (array of block IDs) to a node. */
	getNodePath(nodeId: BlockId): BlockId[] | undefined {
		return findNodePath(this.doc, nodeId) as BlockId[] | undefined;
	}

	/** Returns the parent BlockNode of a node, or undefined for top-level blocks. */
	getParent(nodeId: BlockId): BlockNode | undefined {
		const path = findNodePath(this.doc, nodeId);
		if (!path || path.length <= 1) return undefined;
		const parentId = path[path.length - 2] as BlockId | undefined;
		if (!parentId) return undefined;
		return findNode(this.doc, parentId);
	}

	/** Returns a new state with the given selection validated against this document. */
	withSelection(selection: EditorSelection): EditorState {
		const validated: EditorSelection = validateSelection(this.doc, cloneEditorSelection(selection));
		return new EditorState(this.doc, validated, this.storedMarks, this.schema);
	}

	/** Returns a new state with the given stored marks (pending caret mark toggles), or none. */
	withStoredMarks(storedMarks: readonly Mark[] | null): EditorState {
		return new EditorState(this.doc, this.selection, storedMarks, this.schema);
	}

	/** Serializes the state to JSON. */
	toJSON(): { readonly doc: Document; readonly selection: EditorSelection } {
		return {
			doc: cloneDocument(this.doc),
			selection: cloneEditorSelection(this.selection),
		};
	}

	/** Deserializes a state from JSON. */
	static fromJSON(
		json: { doc: Document; selection: EditorSelection },
		schema?: Schema,
	): EditorState {
		return EditorState.create({ doc: json.doc, selection: json.selection, schema });
	}
}

/** Validates a position against the document, clamping or falling back as needed. */
function validatePosition(doc: Document, pos: Position): Position {
	const block = findNode(doc, pos.blockId);
	if (block && isLeafBlock(block)) {
		const length = getBlockLength(block);
		const finiteOffset: number = Number.isFinite(pos.offset) ? Math.trunc(pos.offset) : 0;
		const offset: number = Math.max(0, Math.min(length, finiteOffset));
		if (offset !== pos.offset) {
			return createPosition(pos.blockId, offset, pos.path);
		}
		return pos;
	}

	const firstLeaf = findFirstLeafBlock(block ? block.children : doc.children);
	if (firstLeaf) return createPosition(firstLeaf.id, 0);
	const documentLeaf = findFirstLeafBlock(doc.children);
	return documentLeaf ? createPosition(documentLeaf.id, 0) : pos;
}

/** Validates a selection against the document, ensuring blockIds exist and offsets are in bounds. */
function validateSelection(doc: Document, sel: EditorSelection): EditorSelection {
	if (isNodeSelection(sel)) {
		const node = findNode(doc, sel.nodeId);
		if (node) return sel;
		// Node was deleted — fall back to first leaf block
		return fallbackSelection(doc, sel);
	}
	if (isGapCursor(sel)) {
		const node = findNode(doc, sel.blockId);
		if (node) return sel;
		// Referenced block was deleted — fall back to first leaf block
		return fallbackSelection(doc, sel);
	}
	const anchor = validatePosition(doc, sel.anchor);
	const head = validatePosition(doc, sel.head);
	if (anchor === sel.anchor && head === sel.head) return sel;
	return createSelection(anchor, head);
}

/** Returns a collapsed selection on the first leaf block, or the original selection if no blocks exist. */
function fallbackSelection(doc: Document, sel: EditorSelection): EditorSelection {
	const leaf = findFirstLeafBlock(doc.children);
	if (!leaf) return sel;
	return createCollapsedSelection(leaf.id, 0);
}

/** Descends into the first child of each container block to find the first leaf block. */
function findFirstLeafBlock(children: readonly ChildNode[]): BlockNode | null {
	for (const child of children) {
		if (!isBlockNode(child)) continue;
		if (isLeafBlock(child)) return child;
		const nested: BlockNode | null = findFirstLeafBlock(child.children);
		if (nested) return nested;
	}
	return null;
}

/** Recursively builds a Map of blockId → BlockNode for all nodes in the tree. */
function buildBlockMap(doc: Document): Map<BlockId, BlockNode> {
	const map = new Map<BlockId, BlockNode>();
	function walk(blocks: readonly ChildNode[]): void {
		for (const child of blocks) {
			if (isBlockNode(child)) {
				map.set(child.id, child);
				walk(child.children);
			}
		}
	}
	walk(doc.children);
	return map;
}

/** Returns leaf-block IDs in depth-first order. */
function buildBlockOrder(doc: Document): readonly BlockId[] {
	const order: BlockId[] = [];
	function walk(blocks: readonly ChildNode[]): void {
		for (const child of blocks) {
			if (isBlockNode(child)) {
				if (isLeafBlock(child)) {
					order.push(child.id);
				} else {
					walk(child.children);
				}
			}
		}
	}
	walk(doc.children);
	return Object.freeze(order);
}
