/**
 * Per-step rebase functions: each takes a {@link Step}, a {@link Mapping}
 * that describes intervening changes in position space, and the current
 * document state, and returns either the rebased step or `null` when the
 * step can no longer be applied meaningfully.
 *
 * This is the symmetric counterpart to {@link getStepMap} / {@link applyStep}
 * / {@link invertStep}: where `getStepMap` answers "how do positions shift
 * **through** this step", these `mapXxx` functions answer "how do this
 * step's *inputs* shift through *another* mapping". The pair is what makes
 * undo/redo robust under out-of-band intervening edits, and the same
 * primitive is the foundation any future collaborative-editing layer needs.
 *
 * ## `null`-semantics
 *
 * A `null` return is not an error — it means the step's referenced
 * coordinates no longer address live content in the current frame. Callers
 * (e.g. {@link HistoryManager.undo}) treat this as "abandon the whole
 * undo/redo group", because applying a partial rebase would silently
 * corrupt the document.
 *
 * Conditions that produce `null`:
 *
 * - the host block was removed by an intervening edit;
 * - a single-offset step's offset fell inside removed/replaced content;
 * - a range step's range was fully eaten;
 * - a range step's endpoints landed in different blocks (fragmented);
 * - for structural steps, an ancestor in `parentPath` was removed or
 *   migrated to a new block identity.
 *
 * Dispatch is via the {@link StepHandlerRegistry} so adding a new `Step`
 * variant fails to type-check until its `map` is registered.
 */

import type { BlockNode, Document, InlineNode } from '../model/Document.js';
import {
	getBlockContentSegmentsInRange,
	getBlockLength,
	getBlockMarksAtOffset,
	getBlockText,
	getContentAtOffset,
	isInlineNode,
} from '../model/Document.js';
import { findNode, resolveChildAt, resolveNodeByPath } from '../model/NodeResolver.js';
import type { BlockId } from '../model/TypeBrands.js';
import {
	type MappedInBlockRange,
	type Mapping,
	mapChildIndex,
	mapInBlockRange,
	mapInsertionIndex,
	mapOffsetInBlock,
} from './Mapping.js';
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
	SetStoredMarksStep,
	SplitBlockStep,
	Step,
} from './Steps.js';

// --- Helpers ---

/**
 * Spreads `path` onto a rebased step only when the block identity did not
 * change. A migrated block likely sits at a different parent path, so
 * carrying the stale hint would mislead the applyStep fast-path lookup;
 * dropping it falls back to a global block-id search.
 */
function preservedPath(
	originalBlockId: BlockId,
	newBlockId: BlockId,
	path: readonly BlockId[] | undefined,
): { readonly path: readonly BlockId[] } | Record<string, never> {
	if (!path) return {};
	if (originalBlockId !== newBlockId) return {};
	return { path };
}

/**
 * Validates that every block id along `parentPath` still exists and has
 * not migrated. The `parentPath` itself is **never** rebased through
 * `childIndexShift` / `blockRemoval` (those describe shifts in *child
 * slots*, not in block identity), so when any ancestor block is gone the
 * structural anchor is lost and the step must be abandoned.
 */
function parentPathStillValid(parentPath: readonly BlockId[], mapping: Mapping): boolean {
	if (mapping.isEmpty) return true;
	for (const id of parentPath) {
		const result = mapping.mapResult({ blockId: id, offset: 0 }, -1);
		if (result.deleted) return false;
		if (result.pos.blockId !== id) return false;
	}
	return true;
}

/**
 * Returns whether a rebased range is identical to the original range —
 * letting callers return the input step unchanged to preserve reference
 * equality (cheap downstream change-detection short-circuit).
 */
function isRangeUnchanged(
	original: { readonly blockId: BlockId; readonly from: number; readonly to: number },
	mapped: MappedInBlockRange,
): boolean {
	return (
		mapped.blockId === original.blockId &&
		mapped.from === original.from &&
		mapped.to === original.to
	);
}

// --- Content-shifting steps ---

export function mapInsertText(step: InsertTextStep, mapping: Mapping, _doc: Document): Step | null {
	const mapped = mapOffsetInBlock(step.blockId, step.offset, mapping, -1);
	if (!mapped) return null;
	if (mapped.blockId === step.blockId && mapped.from === step.offset) return step;
	return {
		type: 'insertText',
		blockId: mapped.blockId,
		offset: mapped.from,
		text: step.text,
		marks: step.marks,
		...(step.segments ? { segments: step.segments } : {}),
		...preservedPath(step.blockId, mapped.blockId, step.path),
	};
}

export function mapDeleteText(step: DeleteTextStep, mapping: Mapping, doc: Document): Step | null {
	const mapped = mapInBlockRange(step.blockId, step.from, step.to, mapping);
	if (!mapped) return null;
	if (isRangeUnchanged({ blockId: step.blockId, from: step.from, to: step.to }, mapped)) {
		return step;
	}

	// Re-snapshot the content payload from the current doc — the original
	// `deletedText` / `deletedSegments` / `deletedMarks` describe content that
	// no longer sits at the rebased range. Without the refresh, redoing this
	// undo would produce a step whose inverse reinserts the wrong content.
	const block = findNode(doc, mapped.blockId);
	if (!block) return null;
	const deletedText = getBlockText(block).slice(mapped.from, mapped.to);
	const deletedMarks = getBlockMarksAtOffset(block, mapped.from);
	const deletedSegments = getBlockContentSegmentsInRange(block, mapped.from, mapped.to);

	return {
		type: 'deleteText',
		blockId: mapped.blockId,
		from: mapped.from,
		to: mapped.to,
		deletedText,
		deletedMarks,
		deletedSegments,
		...preservedPath(step.blockId, mapped.blockId, step.path),
	};
}

export function mapInsertInlineNode(
	step: InsertInlineNodeStep,
	mapping: Mapping,
	_doc: Document,
): Step | null {
	const mapped = mapOffsetInBlock(step.blockId, step.offset, mapping, -1);
	if (!mapped) return null;
	if (mapped.blockId === step.blockId && mapped.from === step.offset) return step;
	return {
		type: 'insertInlineNode',
		blockId: mapped.blockId,
		offset: mapped.from,
		node: step.node,
		...preservedPath(step.blockId, mapped.blockId, step.path),
	};
}

export function mapRemoveInlineNode(
	step: RemoveInlineNodeStep,
	mapping: Mapping,
	doc: Document,
): Step | null {
	// Inline nodes occupy [offset, offset+1) atomically. Treating the position
	// as a width-1 range with sticky-right `from` is what keeps the rebased
	// offset pointing at the SAME slot even when intervening edits inserted
	// content immediately before it.
	const mapped = mapInBlockRange(step.blockId, step.offset, step.offset + 1, mapping, 1, 1);
	if (!mapped) return null;
	if (mapped.to - mapped.from !== 1) return null;

	// Verify the inline at the rebased slot is still the one the user wanted
	// to remove. The position mapping does not track inline identity, so an
	// intervening `removeInlineNode` + `insertInlineNode` pair at the same
	// offset would shift the position by zero net while replacing the
	// content. Removing the substitute would corrupt the agent's edit; abandon
	// the group instead.
	const block = findNode(doc, mapped.blockId);
	if (!block) return null;
	const content = getContentAtOffset(block, mapped.from);
	if (!content || content.kind !== 'inline' || !isInlineNode(content.node)) return null;
	if (!inlineNodesEqual(step.removedNode, content.node)) return null;

	if (mapped.blockId === step.blockId && mapped.from === step.offset) return step;
	return {
		type: 'removeInlineNode',
		blockId: mapped.blockId,
		offset: mapped.from,
		removedNode: content.node,
		...preservedPath(step.blockId, mapped.blockId, step.path),
	};
}

// --- Structural block steps ---

export function mapSplitBlock(step: SplitBlockStep, mapping: Mapping, _doc: Document): Step | null {
	const mapped = mapOffsetInBlock(step.blockId, step.offset, mapping, -1);
	if (!mapped) return null;
	if (mapped.blockId === step.blockId && mapped.from === step.offset) return step;
	return {
		type: 'splitBlock',
		blockId: mapped.blockId,
		offset: mapped.from,
		newBlockId: step.newBlockId,
		...(step.newBlockType !== undefined ? { newBlockType: step.newBlockType } : {}),
		...(step.newBlockAttrs ? { newBlockAttrs: step.newBlockAttrs } : {}),
		...(step.newBlockHTMLId !== undefined ? { newBlockHTMLId: step.newBlockHTMLId } : {}),
		...preservedPath(step.blockId, mapped.blockId, step.path),
	};
}

export function mapMergeBlocks(
	step: MergeBlocksStep,
	mapping: Mapping,
	doc: Document,
): Step | null {
	if (mapping.isEmpty) return step;

	// Both blocks must remain addressable as distinct entities.
	const targetProbe = mapping.mapResult({ blockId: step.targetBlockId, offset: 0 }, -1);
	const sourceProbe = mapping.mapResult({ blockId: step.sourceBlockId, offset: 0 }, -1);
	if (targetProbe.deleted || sourceProbe.deleted) return null;
	const newTargetId = targetProbe.pos.blockId;
	const newSourceId = sourceProbe.pos.blockId;
	if (newTargetId === newSourceId) return null;

	// Recompute targetLengthBefore from current doc — intervening edits inside
	// the target block changed its length, and applyMergeBlocks doesn't use
	// this field (it merges by ID), but the inverse split step does, and a
	// stale length would split at the wrong offset on redo.
	const target = findNode(doc, newTargetId);
	if (!target) return null;
	const targetLengthBefore = getBlockLength(target);

	if (
		newTargetId === step.targetBlockId &&
		newSourceId === step.sourceBlockId &&
		targetLengthBefore === step.targetLengthBefore
	) {
		return step;
	}

	return {
		type: 'mergeBlocks',
		targetBlockId: newTargetId,
		sourceBlockId: newSourceId,
		targetLengthBefore,
		...(step.sourceType !== undefined ? { sourceType: step.sourceType } : {}),
		...(step.sourceAttrs ? { sourceAttrs: step.sourceAttrs } : {}),
		...(step.sourceHTMLId !== undefined ? { sourceHTMLId: step.sourceHTMLId } : {}),
		...preservedPath(step.targetBlockId, newTargetId, step.path),
	};
}

// --- Mark steps ---

export function mapAddMark(step: AddMarkStep, mapping: Mapping, _doc: Document): Step | null {
	const mapped = mapInBlockRange(step.blockId, step.from, step.to, mapping);
	if (!mapped) return null;
	if (isRangeUnchanged({ blockId: step.blockId, from: step.from, to: step.to }, mapped)) {
		return step;
	}
	return {
		type: 'addMark',
		blockId: mapped.blockId,
		from: mapped.from,
		to: mapped.to,
		mark: step.mark,
		...preservedPath(step.blockId, mapped.blockId, step.path),
	};
}

export function mapRemoveMark(step: RemoveMarkStep, mapping: Mapping, _doc: Document): Step | null {
	const mapped = mapInBlockRange(step.blockId, step.from, step.to, mapping);
	if (!mapped) return null;
	if (isRangeUnchanged({ blockId: step.blockId, from: step.from, to: step.to }, mapped)) {
		return step;
	}
	return {
		type: 'removeMark',
		blockId: mapped.blockId,
		from: mapped.from,
		to: mapped.to,
		mark: step.mark,
		...preservedPath(step.blockId, mapped.blockId, step.path),
	};
}

// --- Identity / attribute steps ---

export function mapSetStoredMarks(
	step: SetStoredMarksStep,
	_mapping: Mapping,
	_doc: Document,
): Step | null {
	// State-level only, no document coordinates to rebase.
	return step;
}

export function mapSetBlockType(
	step: SetBlockTypeStep,
	mapping: Mapping,
	doc: Document,
): Step | null {
	if (mapping.isEmpty) return step;
	const probe = mapping.mapResult({ blockId: step.blockId, offset: 0 }, -1);
	if (probe.deleted) return null;
	const newBlockId = probe.pos.blockId;

	// Re-snapshot the previous type / attrs from the current doc so the inverse
	// step restores what was actually there post-intervening, not what was there
	// when the original step was emitted.
	const block: BlockNode | undefined = findNode(doc, newBlockId);
	if (!block) return null;

	if (
		newBlockId === step.blockId &&
		block.type === step.previousNodeType &&
		blockAttrsEqual(block.attrs, step.previousAttrs)
	) {
		return step;
	}

	return {
		type: 'setBlockType',
		blockId: newBlockId,
		nodeType: step.nodeType,
		...(step.attrs ? { attrs: step.attrs } : {}),
		previousNodeType: block.type,
		...(block.attrs ? { previousAttrs: block.attrs } : {}),
		...preservedPath(step.blockId, newBlockId, step.path),
	};
}

export function mapSetNodeAttr(
	step: SetNodeAttrStep,
	mapping: Mapping,
	doc: Document,
): Step | null {
	if (mapping.isEmpty) return step;
	if (!parentPathStillValid(step.path, mapping)) return null;
	const node = resolveNodeByPath(doc, step.path);
	if (!node) return null;
	return {
		type: 'setNodeAttr',
		path: step.path,
		attrs: step.attrs,
		...(node.attrs ? { previousAttrs: node.attrs } : {}),
	};
}

export function mapSetInlineNodeAttr(
	step: SetInlineNodeAttrStep,
	mapping: Mapping,
	doc: Document,
): Step | null {
	const mapped = mapInBlockRange(step.blockId, step.offset, step.offset + 1, mapping, 1, 1);
	if (!mapped) return null;
	if (mapped.to - mapped.from !== 1) return null;
	if (mapped.blockId === step.blockId && mapped.from === step.offset) {
		return step;
	}

	const block = findNode(doc, mapped.blockId);
	if (!block) return null;
	const content = getContentAtOffset(block, mapped.from);
	if (!content || content.kind !== 'inline' || !isInlineNode(content.node)) return null;
	return {
		type: 'setInlineNodeAttr',
		blockId: mapped.blockId,
		offset: mapped.from,
		attrs: step.attrs,
		previousAttrs: content.node.attrs,
		...preservedPath(step.blockId, mapped.blockId, step.path),
	};
}

// --- Tree-structural steps ---

export function mapInsertNode(step: InsertNodeStep, mapping: Mapping, _doc: Document): Step | null {
	if (!parentPathStillValid(step.parentPath, mapping)) return null;
	// Insertion-slot semantics: the slot survives even when the block
	// previously at this index was removed by an intervening edit. The slot
	// is *where to insert*, not a reference to an existing child.
	const rebasedIndex: number = mapInsertionIndex(step.parentPath, step.index, mapping);
	if (rebasedIndex === step.index) return step;
	return {
		type: 'insertNode',
		parentPath: step.parentPath,
		index: rebasedIndex,
		node: step.node,
	};
}

export function mapRemoveNode(step: RemoveNodeStep, mapping: Mapping, doc: Document): Step | null {
	if (!parentPathStillValid(step.parentPath, mapping)) return null;
	// The to-be-removed block itself must still exist as a distinct block.
	const probe = mapping.mapResult({ blockId: step.removedNode.id, offset: 0 }, -1);
	if (probe.deleted) return null;
	if (probe.pos.blockId !== step.removedNode.id) return null;

	const rebasedIndex: number | null = mapChildIndex(step.parentPath, step.index, mapping);
	// `null` means an intervening edit already removed the exact slot this
	// step targets; the inverse cannot meaningfully proceed.
	if (rebasedIndex === null) return null;

	// Re-snapshot the removed subtree from the current doc — intervening edits
	// may have modified the block's content (text inserted, marks toggled,
	// child blocks added) after the original step was recorded. Without the
	// refresh, the rebased step's inverse `insertNode` would restore the stale
	// payload and silently lose those edits on a subsequent undo. Same class
	// of bug as the inline identity check in {@link mapRemoveInlineNode}.
	const block = resolveChildAt(doc, step.parentPath, rebasedIndex);
	if (!block) return null;
	// Defensive structural-integrity check: the rebased index must point at
	// the block we expect. A mismatch indicates either a mapping inconsistency
	// or that the slot is now occupied by a different block — either way we
	// must not remove an unrelated subtree.
	if (block.id !== step.removedNode.id) return null;

	if (rebasedIndex === step.index && block === step.removedNode) return step;
	return {
		type: 'removeNode',
		parentPath: step.parentPath,
		index: rebasedIndex,
		removedNode: block,
	};
}

// --- Local utilities ---

function blockAttrsEqual(
	a: Readonly<Record<string, unknown>> | undefined,
	b: Readonly<Record<string, unknown>> | undefined,
): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;
	for (const k of aKeys) {
		if (a[k] !== b[k]) return false;
	}
	return true;
}

function inlineNodesEqual(a: InlineNode, b: InlineNode): boolean {
	if (a === b) return true;
	if (a.inlineType !== b.inlineType) return false;
	return blockAttrsEqual(a.attrs, b.attrs);
}
