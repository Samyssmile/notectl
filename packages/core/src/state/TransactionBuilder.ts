/**
 * Fluent builder for constructing transactions step by step.
 * Tracks a working document copy to auto-derive data for convenience methods.
 */

import type {
	BlockAttrs,
	BlockNode,
	ContentSegment,
	Document,
	InlineNode,
	Mark,
} from '../model/Document.js';
import {
	getBlockContentSegmentsInRange,
	getBlockLength,
	getBlockMarksAtOffset,
	getBlockText,
	getContentAtOffset,
	getInlineChildren,
	isInlineNode,
	textSegment,
} from '../model/Document.js';
import { findNode, resolveChildAt, resolveNodeByPath } from '../model/NodeResolver.js';
import type { EditorSelection } from '../model/Selection.js';
import { createNodeSelection } from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import { findRangesMissingMark, findRangesWithMark } from './InlineContentOps.js';
import { Mapping, type StepMap } from './Mapping.js';
import { applyStep, getStepMap } from './StepHandlers.js';
import { isMoveNodeNoOp } from './Steps.js';
import type {
	AddMarkStep,
	DeleteTextStep,
	InsertInlineNodeStep,
	InsertNodeStep,
	InsertTextStep,
	MergeBlocksStep,
	MoveNodeStep,
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
	private readonly stepMaps: StepMap[] = [];
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
		segments?: readonly ContentSegment[],
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
		deletedSegments?: readonly ContentSegment[],
	): this {
		let segments: readonly ContentSegment[];
		if (deletedSegments) {
			segments = deletedSegments;
		} else if (this.workingDoc) {
			const block = findNode(this.workingDoc, blockId);
			segments = block
				? getBlockContentSegmentsInRange(block, from, to)
				: [textSegment(deletedText, [...deletedMarks])];
		} else {
			segments = [textSegment(deletedText, [...deletedMarks])];
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
		const doc: Document = this.requireDoc('deleteTextAt');
		const block: BlockNode = this.requireBlock(doc, blockId);

		const text = getBlockText(block);
		const deletedText = text.slice(from, to);
		const deletedMarks = getBlockMarksAtOffset(block, from);
		const deletedSegments = getBlockContentSegmentsInRange(block, from, to);

		return this.deleteText(blockId, from, to, deletedText, deletedMarks, deletedSegments);
	}

	/** Adds a split-block step. Updates workingDoc if available. */
	splitBlock(blockId: BlockId, offset: number, newBlockId: BlockId): this {
		const step: SplitBlockStep = { type: 'splitBlock', blockId, offset, newBlockId };
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/**
	 * Adds a merge-blocks step with explicit data. Updates workingDoc if available.
	 *
	 * `sourceType` / `sourceAttrs` snapshot the source block's identity so the
	 * inverse split can restore it on undo. Callers that do not know the source
	 * identity should prefer {@link mergeBlocksAt}, which derives both from the
	 * working document.
	 */
	mergeBlocks(
		targetBlockId: BlockId,
		sourceBlockId: BlockId,
		targetLengthBefore: number,
		sourceType?: NodeTypeName,
		sourceAttrs?: BlockAttrs,
		sourceHTMLId?: string,
	): this {
		const step: MergeBlocksStep = {
			type: 'mergeBlocks',
			targetBlockId,
			sourceBlockId,
			targetLengthBefore,
			...(sourceType !== undefined ? { sourceType } : {}),
			...(sourceAttrs ? { sourceAttrs } : {}),
			...(sourceHTMLId !== undefined ? { sourceHTMLId } : {}),
		};
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/**
	 * Merges two blocks, auto-deriving targetLengthBefore and the source
	 * block's identity (type + attrs) from the working document. Requires a
	 * document to be provided at construction.
	 */
	mergeBlocksAt(targetBlockId: BlockId, sourceBlockId: BlockId): this {
		const doc: Document = this.requireDoc('mergeBlocksAt');
		const targetBlock: BlockNode = this.requireBlock(doc, targetBlockId);
		const sourceBlock: BlockNode = this.requireBlock(doc, sourceBlockId);

		const targetLengthBefore = getBlockLength(targetBlock);
		return this.mergeBlocks(
			targetBlockId,
			sourceBlockId,
			targetLengthBefore,
			sourceBlock.type,
			sourceBlock.attrs,
			sourceBlock.htmlId,
		);
	}

	/**
	 * Emits one `AddMarkStep` per maximal sub-range of `[from, to)` that does
	 * not yet carry a mark of `mark.type`. Sub-ranges that already carry the
	 * mark type are skipped, so the symmetric inverse never strips a
	 * pre-existing mark.
	 *
	 * Falls back to a single full-range step when no working document is
	 * available (e.g. direct construction without a doc, used in low-level
	 * tests).
	 */
	addMark(blockId: BlockId, from: number, to: number, mark: Mark): this {
		const block: BlockNode | null = this.tryGetBlock(blockId);
		if (!block) {
			const step: AddMarkStep = { type: 'addMark', blockId, from, to, mark };
			this.steps.push(step);
			this.advanceDoc(step);
			return this;
		}

		const ranges = findRangesMissingMark(getInlineChildren(block), from, to, mark.type);
		for (const range of ranges) {
			const step: AddMarkStep = {
				type: 'addMark',
				blockId,
				from: range.from,
				to: range.to,
				mark,
			};
			this.steps.push(step);
			this.advanceDoc(step);
		}
		return this;
	}

	/**
	 * Emits one `RemoveMarkStep` per maximal sub-range of `[from, to)` that
	 * carries a mark of `mark.type`. The step's `mark` is the actual mark
	 * found in the document (including attrs), so the symmetric inverse
	 * restores it faithfully. Sub-ranges without the mark are skipped.
	 *
	 * Falls back to a single full-range step when no working document is
	 * available (e.g. direct construction without a doc, used in low-level
	 * tests).
	 */
	removeMark(blockId: BlockId, from: number, to: number, mark: Mark): this {
		const block: BlockNode | null = this.tryGetBlock(blockId);
		if (!block) {
			const step: RemoveMarkStep = { type: 'removeMark', blockId, from, to, mark };
			this.steps.push(step);
			this.advanceDoc(step);
			return this;
		}

		const ranges = findRangesWithMark(getInlineChildren(block), from, to, mark.type);
		for (const range of ranges) {
			const step: RemoveMarkStep = {
				type: 'removeMark',
				blockId,
				from: range.from,
				to: range.to,
				mark: range.mark,
			};
			this.steps.push(step);
			this.advanceDoc(step);
		}
		return this;
	}

	/** Adds a set-block-type step, changing a block's node type and optionally its attrs. */
	setBlockType(blockId: BlockId, nodeType: NodeTypeName, attrs?: BlockAttrs): this {
		const doc: Document = this.requireDoc('setBlockType');
		const block: BlockNode = this.requireBlock(doc, blockId);
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
		const doc: Document = this.requireDoc('removeNode');

		const removedNode = resolveChildAt(doc, parentPath, index);
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

	/**
	 * Moves an existing block subtree without changing its identity. Source and
	 * destination coordinates are resolved against the current working document;
	 * `toIndex` is an insertion slot before the source is removed.
	 */
	moveNode(
		fromParentPath: readonly BlockId[],
		fromIndex: number,
		toParentPath: readonly BlockId[],
		toIndex: number,
	): this {
		const doc: Document = this.requireDoc('moveNode');
		const movedNode: BlockNode | undefined = resolveChildAt(doc, fromParentPath, fromIndex);
		if (!movedNode) {
			throw new Error(
				`Node at index ${fromIndex} not found under source path [${fromParentPath.join(', ')}].`,
			);
		}
		if (toParentPath.includes(movedNode.id)) {
			throw new Error(`Cannot move node "${movedNode.id}" into its own subtree.`);
		}

		const destinationLength: number =
			toParentPath.length === 0
				? doc.children.length
				: (resolveNodeByPath(doc, toParentPath)?.children.length ?? -1);
		if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex > destinationLength) {
			throw new Error(
				`Invalid destination index ${toIndex} under path [${toParentPath.join(', ')}].`,
			);
		}

		const step: MoveNodeStep = {
			type: 'moveNode',
			fromParentPath,
			fromIndex,
			toParentPath,
			toIndex,
			movedNode,
		};
		if (isMoveNodeNoOp(step)) return this;
		this.steps.push(step);
		this.advanceDoc(step);
		return this;
	}

	/** Sets attributes on a node at the given path. */
	setNodeAttr(path: readonly BlockId[], attrs: BlockAttrs): this {
		const doc: Document = this.requireDoc('setNodeAttr');

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
		const doc: Document = this.requireDoc('removeInlineNode');
		const block: BlockNode = this.requireBlock(doc, blockId);
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
		const doc: Document = this.requireDoc('setInlineNodeAttr');
		const block: BlockNode = this.requireBlock(doc, blockId);
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
			mapping: Mapping.from(this.stepMaps),
			forwardStepMaps: [...this.stepMaps],
			metadata: {
				origin: this.origin,
				timestamp: Date.now(),
				...(this._readonlyAllowed ? { readonlyAllowed: true } : {}),
			},
		};
	}

	/** Returns the working document or throws if not available. */
	private requireDoc(methodName: string): Document {
		if (!this.workingDoc) {
			throw new Error(
				`${methodName} requires a document. Use state.transaction() or provide doc to constructor.`,
			);
		}
		return this.workingDoc;
	}

	/** Finds a block in the document or throws if not found. */
	private requireBlock(doc: Document, blockId: BlockId): BlockNode {
		const block: BlockNode | undefined = findNode(doc, blockId);
		if (!block) {
			throw new Error(`Block "${blockId}" not found in working document.`);
		}
		return block;
	}

	/**
	 * Returns the resolved block from the working document, or `null` if
	 * either the document is unavailable or the block is missing. Used by
	 * mark builders that want a working-doc-aware planning pass with a
	 * safe fallback when neither precondition holds.
	 */
	private tryGetBlock(blockId: BlockId): BlockNode | null {
		if (!this.workingDoc) return null;
		return findNode(this.workingDoc, blockId) ?? null;
	}

	/**
	 * Advances the working document by applying a step and records its
	 * position-mapping. The map is computed against the pre-apply document
	 * (the only state in which `removeNode` can enumerate descendants), so
	 * the order is: getStepMap → applyStep.
	 *
	 * When no working document is available, falls back to the empty
	 * document — all step types except `removeNode` produce a `StepMap`
	 * that does not consult the document, and `removeNode` carries its
	 * `removedNode` in the step payload, so the fallback is safe.
	 */
	private advanceDoc(step: Step): void {
		const docBefore: Document = this.workingDoc ?? EMPTY_DOC;
		this.stepMaps.push(getStepMap(docBefore, step));
		if (this.workingDoc) {
			this.workingDoc = applyStep(this.workingDoc, step);
		}
	}
}

const EMPTY_DOC: Document = { children: [] };
