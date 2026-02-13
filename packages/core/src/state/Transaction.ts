/**
 * Transaction system for the Notectl editor.
 * Transactions describe atomic, invertible state changes.
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

// --- Step Types ---

export interface InsertTextStep {
	readonly type: 'insertText';
	readonly blockId: BlockId;
	readonly offset: number;
	readonly text: string;
	readonly marks: readonly Mark[];
	readonly segments?: readonly TextSegment[];
	readonly path?: readonly BlockId[];
}

export interface DeleteTextStep {
	readonly type: 'deleteText';
	readonly blockId: BlockId;
	readonly from: number;
	readonly to: number;
	readonly deletedText: string;
	readonly deletedMarks: readonly Mark[];
	readonly deletedSegments: readonly TextSegment[];
	readonly path?: readonly BlockId[];
}

export interface SplitBlockStep {
	readonly type: 'splitBlock';
	readonly blockId: BlockId;
	readonly offset: number;
	readonly newBlockId: BlockId;
	readonly path?: readonly BlockId[];
}

export interface MergeBlocksStep {
	readonly type: 'mergeBlocks';
	readonly targetBlockId: BlockId;
	readonly sourceBlockId: BlockId;
	readonly targetLengthBefore: number;
	readonly path?: readonly BlockId[];
}

export interface AddMarkStep {
	readonly type: 'addMark';
	readonly blockId: BlockId;
	readonly from: number;
	readonly to: number;
	readonly mark: Mark;
	readonly path?: readonly BlockId[];
}

export interface RemoveMarkStep {
	readonly type: 'removeMark';
	readonly blockId: BlockId;
	readonly from: number;
	readonly to: number;
	readonly mark: Mark;
	readonly path?: readonly BlockId[];
}

export interface SetStoredMarksStep {
	readonly type: 'setStoredMarks';
	readonly marks: readonly Mark[] | null;
	readonly previousMarks: readonly Mark[] | null;
}

export interface SetBlockTypeStep {
	readonly type: 'setBlockType';
	readonly blockId: BlockId;
	readonly nodeType: NodeTypeName;
	readonly attrs?: BlockAttrs;
	readonly previousNodeType: NodeTypeName;
	readonly previousAttrs?: BlockAttrs;
	readonly path?: readonly BlockId[];
}

// --- Structural Steps (for nested documents) ---

export interface InsertNodeStep {
	readonly type: 'insertNode';
	readonly parentPath: readonly BlockId[];
	readonly index: number;
	readonly node: BlockNode;
}

export interface RemoveNodeStep {
	readonly type: 'removeNode';
	readonly parentPath: readonly BlockId[];
	readonly index: number;
	readonly removedNode: BlockNode;
}

export interface SetNodeAttrStep {
	readonly type: 'setNodeAttr';
	readonly path: readonly BlockId[];
	readonly attrs: BlockAttrs | undefined;
	readonly previousAttrs?: BlockAttrs;
}

// --- InlineNode Steps ---

export interface InsertInlineNodeStep {
	readonly type: 'insertInlineNode';
	readonly blockId: BlockId;
	readonly offset: number;
	readonly node: InlineNode;
	readonly path?: readonly BlockId[];
}

export interface RemoveInlineNodeStep {
	readonly type: 'removeInlineNode';
	readonly blockId: BlockId;
	readonly offset: number;
	readonly removedNode: InlineNode;
	readonly path?: readonly BlockId[];
}

export interface SetInlineNodeAttrStep {
	readonly type: 'setInlineNodeAttr';
	readonly blockId: BlockId;
	readonly offset: number;
	readonly attrs: Readonly<Record<string, string | number | boolean>>;
	readonly previousAttrs: Readonly<Record<string, string | number | boolean>>;
	readonly path?: readonly BlockId[];
}

export type Step =
	| InsertTextStep
	| DeleteTextStep
	| SplitBlockStep
	| MergeBlocksStep
	| AddMarkStep
	| RemoveMarkStep
	| SetStoredMarksStep
	| SetBlockTypeStep
	| InsertNodeStep
	| RemoveNodeStep
	| SetNodeAttrStep
	| InsertInlineNodeStep
	| RemoveInlineNodeStep
	| SetInlineNodeAttrStep;

// --- Transaction ---

export type TransactionOrigin = 'input' | 'paste' | 'command' | 'history' | 'api';

export interface TransactionMetadata {
	readonly origin: TransactionOrigin;
	readonly timestamp: number;
}

export interface Transaction {
	readonly steps: readonly Step[];
	readonly selectionBefore: EditorSelection;
	readonly selectionAfter: EditorSelection;
	readonly storedMarksAfter: readonly Mark[] | null;
	readonly metadata: TransactionMetadata;
}

// --- Step Inversion ---

/** Inverts a single step for undo. */
export function invertStep(step: Step): Step {
	switch (step.type) {
		case 'insertText':
			return {
				type: 'deleteText',
				blockId: step.blockId,
				from: step.offset,
				to: step.offset + step.text.length,
				deletedText: step.text,
				deletedMarks: step.marks,
				deletedSegments: step.segments ?? [{ text: step.text, marks: [...step.marks] }],
				...(step.path ? { path: step.path } : {}),
			};
		case 'deleteText':
			return {
				type: 'insertText',
				blockId: step.blockId,
				offset: step.from,
				text: step.deletedText,
				marks: step.deletedMarks,
				segments: step.deletedSegments,
				...(step.path ? { path: step.path } : {}),
			};
		case 'splitBlock':
			return {
				type: 'mergeBlocks',
				targetBlockId: step.blockId,
				sourceBlockId: step.newBlockId,
				targetLengthBefore: step.offset,
				...(step.path ? { path: step.path } : {}),
			};
		case 'mergeBlocks':
			return {
				type: 'splitBlock',
				blockId: step.targetBlockId,
				offset: step.targetLengthBefore,
				newBlockId: step.sourceBlockId,
				...(step.path ? { path: step.path } : {}),
			};
		case 'addMark':
			return {
				type: 'removeMark',
				blockId: step.blockId,
				from: step.from,
				to: step.to,
				mark: step.mark,
				...(step.path ? { path: step.path } : {}),
			};
		case 'removeMark':
			return {
				type: 'addMark',
				blockId: step.blockId,
				from: step.from,
				to: step.to,
				mark: step.mark,
				...(step.path ? { path: step.path } : {}),
			};
		case 'setStoredMarks':
			return {
				type: 'setStoredMarks',
				marks: step.previousMarks,
				previousMarks: step.marks,
			};
		case 'setBlockType':
			return {
				type: 'setBlockType',
				blockId: step.blockId,
				nodeType: step.previousNodeType,
				attrs: step.previousAttrs,
				previousNodeType: step.nodeType,
				previousAttrs: step.attrs,
				...(step.path ? { path: step.path } : {}),
			};
		case 'insertNode':
			return {
				type: 'removeNode',
				parentPath: step.parentPath,
				index: step.index,
				removedNode: step.node,
			};
		case 'removeNode':
			return {
				type: 'insertNode',
				parentPath: step.parentPath,
				index: step.index,
				node: step.removedNode,
			};
		case 'setNodeAttr':
			return {
				type: 'setNodeAttr',
				path: step.path,
				attrs: step.previousAttrs,
				previousAttrs: step.attrs,
			};
		case 'insertInlineNode':
			return {
				type: 'removeInlineNode',
				blockId: step.blockId,
				offset: step.offset,
				removedNode: step.node,
				...(step.path ? { path: step.path } : {}),
			};
		case 'removeInlineNode':
			return {
				type: 'insertInlineNode',
				blockId: step.blockId,
				offset: step.offset,
				node: step.removedNode,
				...(step.path ? { path: step.path } : {}),
			};
		case 'setInlineNodeAttr':
			return {
				type: 'setInlineNodeAttr',
				blockId: step.blockId,
				offset: step.offset,
				attrs: step.previousAttrs,
				previousAttrs: step.attrs,
				...(step.path ? { path: step.path } : {}),
			};
	}
}

/** Inverts an entire transaction (reverses step order and swaps selections). */
export function invertTransaction(tr: Transaction): Transaction {
	return {
		steps: tr.steps.map(invertStep).reverse(),
		selectionBefore: tr.selectionAfter,
		selectionAfter: tr.selectionBefore,
		storedMarksAfter: null,
		metadata: {
			origin: 'history',
			timestamp: Date.now(),
		},
	};
}

// --- TransactionBuilder ---

/** Fluent API for building transactions. */
export class TransactionBuilder {
	private readonly steps: Step[] = [];
	private selection: EditorSelection;
	private storedMarks: readonly Mark[] | null;
	private readonly selectionBefore: EditorSelection;
	private readonly origin: TransactionOrigin;
	private workingDoc: Document | null;

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
