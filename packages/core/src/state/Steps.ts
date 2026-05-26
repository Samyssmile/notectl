/**
 * Step type definitions for the transaction system.
 * Each step represents an atomic, invertible change to the document.
 */

import type { BlockAttrs, BlockNode, InlineNode, Mark, TextSegment } from '../model/Document.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';

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

export type TransactionOrigin = 'input' | 'paste' | 'command' | 'history' | 'api';
