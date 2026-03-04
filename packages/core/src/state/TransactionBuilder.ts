/**
 * Fluent builder for constructing transactions step by step.
 * Tracks a working document copy to auto-derive data for convenience methods.
 */

import type {
	BlockAttrs,
	BlockNode,
	Document,
	InlineNode,
	Mark,
	TextSegment,
} from '../model/Document.js';
import {
	getBlockLength,
	getBlockMarksAtOffset,
	getBlockSegmentsInRange,
	getBlockText,
	getContentAtOffset,
	getInlineChildren,
	isBlockNode,
	isInlineNode,
} from '../model/Document.js';
import { findNode, resolveNodeByPath } from '../model/NodeResolver.js';
import type { EditorSelection } from '../model/Selection.js';
import { createNodeSelection } from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import { applyStep } from './StepApplication.js';
import type {
	AddMarkStep,
	DeleteTextStep,
	InsertInlineNodeStep,
	InsertNodeStep,
	InsertTextStep,
	MergeBlocksStep,
	RemoveInlineNodeStep,
	RemoveMarkStep,
	RemoveNodeStep,
	SetBlockTypeStep,
	SetInlineNodeAttrStep,
	SetNodeAttrStep,
	SplitBlockStep,
	Step,
	TransactionOrigin,
} from './Steps.js';
import type { Transaction } from './Transaction.js';

/** Fluent API for building transactions. */
export class TransactionBuilder {
	private readonly steps: Step[] = [];
	private selection: EditorSelection;
	private storedMarks: readonly Mark[] | null;
	private readonly selectionBefore: EditorSelection;
	private readonly origin: TransactionOrigin;
	private workingDoc: Document | null;
	private _readonlyAllowed = false;

	constructor(
		currentSelection: EditorSelection,
		currentStoredMarks: readonly Mark[] | null,
		origin: TransactionOrigin = 'api',
		doc?: Document,
	) {
		this.selection = currentSelection;
		this.selectionBefore = currentSelection;
		this.storedMarks = currentStoredMarks;
		this.origin = origin;
		this.workingDoc = doc ?? null;
	}

	/** Adds an insert-text step. Updates workingDoc if available. */
	insertText(
		blockId: BlockId,
		offset: number,
		text: string,
		marks: readonly Mark[],
		segments?: readonly TextSegment[],
	): this {
		const step: InsertTextStep = {
			type: 'insertText',
			blockId,
			offset,
			text,
			marks,
			...(segments ? { segments } : {}),
		};
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/** Adds a delete-text step with explicit data. Updates workingDoc if available. */
	deleteText(
		blockId: BlockId,
		from: number,
		to: number,
		deletedText: string,
		deletedMarks: readonly Mark[],
		deletedSegments?: readonly TextSegment[],
	): this {
		let segments: readonly TextSegment[];
		if (deletedSegments) {
			segments = deletedSegments;
		} else if (this.workingDoc) {
			const block = findNode(this.workingDoc, blockId);
			segments = block
				? getBlockSegmentsInRange(block, from, to)
				: [{ text: deletedText, marks: [...deletedMarks] }];
		} else {
			segments = [{ text: deletedText, marks: [...deletedMarks] }];
		}
		const step: DeleteTextStep = {
			type: 'deleteText',
			blockId,
			from,
			to,
			deletedText,
			deletedMarks,
			deletedSegments: segments,
		};
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/**
	 * Deletes text at the given range, auto-deriving deletedText, deletedMarks, and deletedSegments
	 * from the working document. Requires a document to be provided at construction.
	 */
	deleteTextAt(blockId: BlockId, from: number, to: number): this {
		const doc = this.workingDoc;
		if (!doc) {
			throw new Error(
				'deleteTextAt requires a document. Use state.transaction() or provide doc to constructor.',
			);
		}

		const block = findNode(doc, blockId);
		if (!block) {
			throw new Error(`Block "${blockId}" not found in working document.`);
		}

		const text = getBlockText(block);
		const deletedText = text.slice(from, to);
		const deletedMarks = getBlockMarksAtOffset(block, from);
		const deletedSegments = getBlockSegmentsInRange(block, from, to);

		return this.deleteText(blockId, from, to, deletedText, deletedMarks, deletedSegments);
	}

	/** Adds a split-block step. Updates workingDoc if available. */
	splitBlock(blockId: BlockId, offset: number, newBlockId: BlockId): this {
		const step: SplitBlockStep = { type: 'splitBlock', blockId, offset, newBlockId };
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/** Adds a merge-blocks step with explicit targetLengthBefore. Updates workingDoc if available. */
	mergeBlocks(targetBlockId: BlockId, sourceBlockId: BlockId, targetLengthBefore: number): this {
		const step: MergeBlocksStep = {
			type: 'mergeBlocks',
			targetBlockId,
			sourceBlockId,
			targetLengthBefore,
		};
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/**
	 * Merges two blocks, auto-deriving targetLengthBefore from the working document.
	 * Requires a document to be provided at construction.
	 */
	mergeBlocksAt(targetBlockId: BlockId, sourceBlockId: BlockId): this {
		const doc = this.workingDoc;
		if (!doc) {
			throw new Error(
				'mergeBlocksAt requires a document. Use state.transaction() or provide doc to constructor.',
			);
		}

		const targetBlock = findNode(doc, targetBlockId);
		if (!targetBlock) {
			throw new Error(`Target block "${targetBlockId}" not found in working document.`);
		}

		const targetLengthBefore = getBlockLength(targetBlock);
		return this.mergeBlocks(targetBlockId, sourceBlockId, targetLengthBefore);
	}

	/** Adds an add-mark step. Updates workingDoc if available. */
	addMark(blockId: BlockId, from: number, to: number, mark: Mark): this {
		const step: AddMarkStep = { type: 'addMark', blockId, from, to, mark };
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/** Adds a remove-mark step. Updates workingDoc if available. */
	removeMark(blockId: BlockId, from: number, to: number, mark: Mark): this {
		const step: RemoveMarkStep = { type: 'removeMark', blockId, from, to, mark };
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/** Adds a set-block-type step, changing a block's node type and optionally its attrs. */
	setBlockType(blockId: BlockId, nodeType: NodeTypeName, attrs?: BlockAttrs): this {
		const doc = this.workingDoc;
		if (!doc) {
			throw new Error(
				'setBlockType requires a document. Use state.transaction() or provide doc to constructor.',
			);
		}
		const block = findNode(doc, blockId);
		if (!block) {
			throw new Error(`Block "${blockId}" not found in working document.`);
		}
		const step: SetBlockTypeStep = {
			type: 'setBlockType',
			blockId,
			nodeType,
			...(attrs ? { attrs } : {}),
			previousNodeType: block.type,
			...(block.attrs ? { previousAttrs: block.attrs } : {}),
		};
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/** Inserts a node as a child of the parent at the given path and index. */
	insertNode(parentPath: readonly BlockId[], index: number, node: BlockNode): this {
		const step: InsertNodeStep = { type: 'insertNode', parentPath, index, node };
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/** Removes a node at the given index from the parent at the given path. */
	removeNode(parentPath: readonly BlockId[], index: number): this {
		const doc = this.workingDoc;
		if (!doc) {
			throw new Error(
				'removeNode requires a document. Use state.transaction() or provide doc to constructor.',
			);
		}

		const removedNode = resolveRemovedNode(doc, parentPath, index);
		if (!removedNode) {
			throw new Error(
				`Node at index ${index} not found under parent path [${parentPath.join(', ')}].`,
			);
		}

		const step: RemoveNodeStep = { type: 'removeNode', parentPath, index, removedNode };
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/** Sets attributes on a node at the given path. */
	setNodeAttr(path: readonly BlockId[], attrs: BlockAttrs): this {
		const doc = this.workingDoc;
		if (!doc) {
			throw new Error(
				'setNodeAttr requires a document. Use state.transaction() or provide doc to constructor.',
			);
		}

		const node = resolveNodeByPath(doc, path);
		if (!node) {
			throw new Error(`Node not found at path [${path.join(', ')}].`);
		}

		const step: SetNodeAttrStep = {
			type: 'setNodeAttr',
			path,
			attrs,
			...(node.attrs ? { previousAttrs: node.attrs } : {}),
		};
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/** Inserts an InlineNode at the given offset within a block. */
	insertInlineNode(blockId: BlockId, offset: number, node: InlineNode): this {
		const step: InsertInlineNodeStep = {
			type: 'insertInlineNode',
			blockId,
			offset,
			node,
		};
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/** Removes an InlineNode at the given offset, deriving removedNode from workingDoc. */
	removeInlineNode(blockId: BlockId, offset: number): this {
		const doc: Document | null = this.workingDoc;
		if (!doc) {
			throw new Error(
				'removeInlineNode requires a document. Use state.transaction() or provide doc.',
			);
		}
		const block: BlockNode | undefined = findNode(doc, blockId);
		if (!block) {
			throw new Error(`Block "${blockId}" not found in working document.`);
		}
		const content = getContentAtOffset(block, offset);
		if (!content || content.kind !== 'inline') {
			throw new Error(`No InlineNode at offset ${offset} in block "${blockId}".`);
		}
		const step: RemoveInlineNodeStep = {
			type: 'removeInlineNode',
			blockId,
			offset,
			removedNode: content.node,
		};
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/** Sets attributes on an InlineNode at the given offset. */
	setInlineNodeAttr(
		blockId: BlockId,
		offset: number,
		attrs: Readonly<Record<string, string | number | boolean>>,
	): this {
		const doc: Document | null = this.workingDoc;
		if (!doc) {
			throw new Error(
				'setInlineNodeAttr requires a document. Use state.transaction() or provide doc.',
			);
		}
		const block: BlockNode | undefined = findNode(doc, blockId);
		if (!block) {
			throw new Error(`Block "${blockId}" not found in working document.`);
		}
		const inlineChildren = getInlineChildren(block);
		let pos = 0;
		for (const child of inlineChildren) {
			if (isInlineNode(child) && pos === offset) {
				const step: SetInlineNodeAttrStep = {
					type: 'setInlineNodeAttr',
					blockId,
					offset,
					attrs,
					previousAttrs: child.attrs,
				};
				this.steps.push(step);
				this.advanceDoc(step);
				return this;
			}
			pos += isInlineNode(child) ? 1 : child.text.length;
		}
		throw new Error(`No InlineNode at offset ${offset} in block "${blockId}".`);
	}

	/** Marks this transaction as allowed in readonly mode. */
	readonlyAllowed(): this {
		this._readonlyAllowed = true;
		return this;
	}

	/** Sets the selection for the resulting state. */
	setSelection(selection: EditorSelection): this {
		this.selection = selection;
		return this;
	}

	/** Sets a NodeSelection for the resulting state. */
	setNodeSelection(nodeId: BlockId, path: readonly BlockId[]): this {
		this.selection = createNodeSelection(nodeId, path);
		return this;
	}

	/** Sets stored marks for the resulting state. */
	setStoredMarks(marks: readonly Mark[] | null, previousMarks: readonly Mark[] | null): this {
		this.steps.push({ type: 'setStoredMarks', marks, previousMarks });
		this.storedMarks = marks;
		return this;
	}

	/** Builds the final transaction. */
	build(): Transaction {
		return {
			steps: [...this.steps],
			selectionBefore: this.selectionBefore,
			selectionAfter: this.selection,
			storedMarksAfter: this.storedMarks,
			metadata: {
				origin: this.origin,
				timestamp: Date.now(),
				...(this._readonlyAllowed ? { readonlyAllowed: true } : {}),
			},
		};
	}

	/** Advances the working document by applying a step. */
	private advanceDoc(step: Step): void {
		if (this.workingDoc) {
			this.workingDoc = applyStep(this.workingDoc, step);
		}
	}
}

/** Helper to create a TransactionBuilder with input origin. */
export function inputTransaction(
	selection: EditorSelection,
	storedMarks: readonly Mark[] | null,
): TransactionBuilder {
	return new TransactionBuilder(selection, storedMarks, 'input');
}

/** Helper to create a TransactionBuilder with command origin. */
export function commandTransaction(
	selection: EditorSelection,
	storedMarks: readonly Mark[] | null,
): TransactionBuilder {
	return new TransactionBuilder(selection, storedMarks, 'command');
}

/** Resolves the block node to be removed from a parent path and index. */
function resolveRemovedNode(
	doc: Document,
	parentPath: readonly BlockId[],
	index: number,
): BlockNode | undefined {
	if (parentPath.length === 0) {
		const child = doc.children[index];
		return child && isBlockNode(child) ? child : undefined;
	}
	const parent = resolveNodeByPath(doc, parentPath);
	if (!parent) return undefined;
	const child = parent.children[index];
	return child && isBlockNode(child) ? child : undefined;
}
