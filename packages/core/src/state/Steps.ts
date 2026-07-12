/**
 * Step type definitions for the transaction system.
 * Each step represents an atomic, invertible change to the document.
 */

import { segmentsLength } from '../model/ContentSlice.js';
import type {
	BlockAttrs,
	BlockNode,
	ContentSegment,
	Document,
	InlineNode,
	Mark,
} from '../model/Document.js';
import { resolveChildAt, resolveNodeByPath } from '../model/NodeResolver.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';

export interface InsertTextStep {
	readonly type: 'insertText';
	readonly blockId: BlockId;
	readonly offset: number;
	readonly text: string;
	readonly marks: readonly Mark[];
	/**
	 * Optional per-segment payload (text with marks, or atomic inline nodes).
	 * When present it supersedes `text`/`marks` on apply, so it must carry the
	 * full content, including any inline nodes, for paste and delete-undo to
	 * round-trip faithfully.
	 */
	readonly segments?: readonly ContentSegment[];
	readonly path?: readonly BlockId[];
}

export interface DeleteTextStep {
	readonly type: 'deleteText';
	readonly blockId: BlockId;
	readonly from: number;
	readonly to: number;
	readonly deletedText: string;
	readonly deletedMarks: readonly Mark[];
	/** Full deleted content (text and inline nodes) so undo restores both. */
	readonly deletedSegments: readonly ContentSegment[];
	readonly path?: readonly BlockId[];
}

export interface SplitBlockStep {
	readonly type: 'splitBlock';
	readonly blockId: BlockId;
	readonly offset: number;
	readonly newBlockId: BlockId;
	/**
	 * Override for the new block's node type. When present, the new block is
	 * created with this type instead of inheriting from the target. Populated
	 * by {@link invertMergeBlocks} so undo can restore the original source
	 * block's identity across cross-type merges.
	 */
	readonly newBlockType?: NodeTypeName;
	/**
	 * Override for the new block's attrs. Only consulted when
	 * {@link newBlockType} is also present; the override pair is taken
	 * as-is (an absent value here means "the source block had no attrs").
	 */
	readonly newBlockAttrs?: BlockAttrs;
	/** Semantic HTML ID restored by an inverse split, if the source block had one. */
	readonly newBlockHTMLId?: string;
	readonly path?: readonly BlockId[];
}

export interface MergeBlocksStep {
	readonly type: 'mergeBlocks';
	readonly targetBlockId: BlockId;
	readonly sourceBlockId: BlockId;
	readonly targetLengthBefore: number;
	/**
	 * Source block's node type at merge time. Captured by the builder so the
	 * inverse split can restore the source block with its original identity.
	 */
	readonly sourceType?: NodeTypeName;
	/** Source block's attrs at merge time, if any. */
	readonly sourceAttrs?: BlockAttrs;
	/** Source block's semantic HTML ID at merge time, if any. */
	readonly sourceHTMLId?: string;
	readonly path?: readonly BlockId[];
}

/**
 * Adds `mark` to every text node in `[from, to)`.
 *
 * **Builder invariant** (enforced by `TransactionBuilder.addMark`): the range
 * carries no text node with a mark of `mark.type`. Steps emitted under this
 * invariant invert exactly to a `RemoveMarkStep` over the same range, so undo
 * cannot strip pre-existing marks. Direct step construction (rare; e.g.
 * middleware) must uphold the same precondition.
 */
export interface AddMarkStep {
	readonly type: 'addMark';
	readonly blockId: BlockId;
	readonly from: number;
	readonly to: number;
	readonly mark: Mark;
	readonly path?: readonly BlockId[];
}

/**
 * Removes the mark of `mark.type` from every text node in `[from, to)`.
 *
 * **Builder invariant** (enforced by `TransactionBuilder.removeMark`): every
 * text node in the range carries exactly `mark` (deep equality, including
 * attrs). The `mark` field therefore stores the actual document mark, which
 * the symmetric inverse (`AddMarkStep`) re-adds verbatim, preserving attrs
 * through undo. Direct step construction must uphold the same precondition.
 */
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

/**
 * Moves one existing block node between parent child lists without changing
 * its identity or descendants. `toIndex` is an insertion slot in the document
 * before removal; same-parent moves adjust it after removing the source.
 */
export interface MoveNodeStep {
	readonly type: 'moveNode';
	readonly fromParentPath: readonly BlockId[];
	readonly fromIndex: number;
	readonly toParentPath: readonly BlockId[];
	readonly toIndex: number;
	readonly movedNode: BlockNode;
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
	| MoveNodeStep
	| SetNodeAttrStep
	| InsertInlineNodeStep
	| RemoveInlineNodeStep
	| SetInlineNodeAttrStep;

export type TransactionOrigin = 'input' | 'paste' | 'command' | 'history' | 'api';

/** Returns the moved node's index in its destination parent after removal. */
export function moveNodeDestinationIndex(step: MoveNodeStep): number {
	return sameBlockPath(step.fromParentPath, step.toParentPath) && step.toIndex > step.fromIndex
		? step.toIndex - 1
		: step.toIndex;
}

/** True when a same-parent move leaves the child list unchanged. */
export function isMoveNodeNoOp(step: MoveNodeStep): boolean {
	return (
		sameBlockPath(step.fromParentPath, step.toParentPath) &&
		moveNodeDestinationIndex(step) === step.fromIndex
	);
}

/** A move resolved and validated against the document it will be applied to. */
export interface ResolvedMoveNodeStep {
	readonly movedNode: BlockNode;
	readonly destinationIndex: number;
}

/**
 * Resolves both sides of a move before any mutation occurs. This is shared by
 * application and StepMap production so an invalid move is consistently an
 * identity operation and can never remove its source without reinserting it.
 */
export function resolveMoveNodeStep(
	doc: Document,
	step: MoveNodeStep,
): ResolvedMoveNodeStep | null {
	const movedNode: BlockNode | undefined = resolveChildAt(doc, step.fromParentPath, step.fromIndex);
	if (!movedNode || movedNode.id !== step.movedNode.id) return null;
	if (step.toParentPath.includes(movedNode.id)) return null;

	const destinationLength: number | null =
		step.toParentPath.length === 0
			? doc.children.length
			: (resolveNodeByPath(doc, step.toParentPath)?.children.length ?? null);
	if (
		destinationLength === null ||
		!Number.isInteger(step.toIndex) ||
		step.toIndex < 0 ||
		step.toIndex > destinationLength
	) {
		return null;
	}

	const sameParent: boolean = sameBlockPath(step.fromParentPath, step.toParentPath);
	const destinationIndex: number = moveNodeDestinationIndex(step);
	const postRemovalLength: number = destinationLength - (sameParent ? 1 : 0);
	if (destinationIndex < 0 || destinationIndex > postRemovalLength) return null;

	return { movedNode, destinationIndex };
}

function sameBlockPath(a: readonly BlockId[], b: readonly BlockId[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((id: BlockId, index: number) => id === b[index]);
}

/**
 * Block-space width an {@link InsertTextStep} occupies once applied. When the
 * step carries `segments` (which may include inline nodes, each width 1), the
 * width is the segment span, not the plain-text length, because `applyInsertText`
 * inserts the segments verbatim. The inverse delete range ({@link invertInsertText})
 * and the forward position map ({@link getMapInsertText}) must both use this so
 * undo/redo of a deletion that removed inline content round-trips without
 * corrupting positions.
 */
export function insertTextStepWidth(step: InsertTextStep): number {
	return step.segments ? segmentsLength(step.segments) : step.text.length;
}
