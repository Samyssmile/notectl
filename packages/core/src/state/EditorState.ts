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
	isBlockNode,
	isLeafBlock,
} from '../model/Document.js';
import { findNode, findNodePath } from '../model/NodeResolver.js';
import type { Schema } from '../model/Schema.js';
import { defaultSchema } from '../model/Schema.js';
import type { EditorSelection } from '../model/Selection.js';
import {
	cloneEditorSelection,
	createCollapsedSelection,
	freezeEditorSelection,
} from '../model/Selection.js';
import { type BlockId, blockId } from '../model/TypeBrands.js';
import { homeSelection, validateSelection } from './SelectionValidation.js';
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
		const selection: EditorSelection = options?.selection
			? validateSelection(doc, schema, cloneEditorSelection(options.selection))
			: (homeSelection(doc, schema) ?? createCollapsedSelection(blockId(''), 0));

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

		const selection: EditorSelection = validateSelection(
			doc,
			this.schema,
			cloneEditorSelection(tr.selectionAfter),
		);
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
		const validated: EditorSelection = validateSelection(
			this.doc,
			this.schema,
			cloneEditorSelection(selection),
		);
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
