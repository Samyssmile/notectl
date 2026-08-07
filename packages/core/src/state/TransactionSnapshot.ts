/**
 * Ownership and invariant boundary for transactions.
 *
 * Builders snapshot payloads as steps are appended so their working document
 * cannot diverge from later caller mutations. Middleware is allowed to replace
 * a transaction, however, so the document-aware final dispatch boundary takes
 * ownership again and rebuilds every StepMap against the actual document frames.
 */

import type { BlockAttrs, BlockNode, ContentSegment, InlineNode, Mark } from '../model/Document.js';
import {
	cloneBlockAttrs,
	cloneBlockNode,
	cloneContentSegments,
	cloneInlineNode,
	cloneMark,
	cloneMarks,
	freezeBlockAttrs,
	freezeBlockNode,
	freezeContentSegments,
	freezeInlineNode,
	freezeMark,
	freezeMarks,
} from '../model/Document.js';
import type { EditorSelection } from '../model/Selection.js';
import { cloneEditorSelection, freezeEditorSelection } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { Mapping, type StepMap } from './Mapping.js';
import type { Step } from './Steps.js';
import type { Transaction, TransactionMetadata } from './Transaction.js';

const VERIFIED_TRANSACTION_MAPS = new WeakSet<Transaction>();

export interface OwnedTransactionParts {
	readonly steps: readonly Step[];
	readonly selectionBefore: EditorSelection;
	readonly selectionAfter: EditorSelection;
	readonly storedMarksAfter: readonly Mark[] | null;
	readonly forwardStepMaps: readonly StepMap[];
	readonly metadata: TransactionMetadata;
}

export interface TransactionSealOptions {
	/** False when maps are deliberate placeholders awaiting a document-aware finalizer. */
	readonly mapsVerified?: boolean;
}

/** Creates an owned, deeply frozen selection snapshot. */
export function snapshotSelection(selection: EditorSelection): EditorSelection {
	return freezeEditorSelection(cloneEditorSelection(selection));
}

/** Creates an owned, deeply frozen optional mark set. */
export function snapshotOptionalMarks(marks: readonly Mark[] | null): readonly Mark[] | null {
	if (!marks) return null;
	const owned = cloneMarks(marks);
	freezeMarks(owned);
	return owned;
}

/** Exhaustive copy-on-boundary for every structured Step payload. */
export function snapshotStep(step: Step): Step {
	switch (step.type) {
		case 'insertText':
			return Object.freeze({
				...step,
				marks: snapshotOptionalMarks(step.marks) ?? Object.freeze([]),
				...(step.segments ? { segments: snapshotSegments(step.segments) } : {}),
				...(step.path ? { path: snapshotPath(step.path) } : {}),
			});
		case 'deleteText':
			return Object.freeze({
				...step,
				deletedMarks: snapshotOptionalMarks(step.deletedMarks) ?? Object.freeze([]),
				deletedSegments: snapshotSegments(step.deletedSegments),
				...(step.path ? { path: snapshotPath(step.path) } : {}),
			});
		case 'splitBlock':
			return Object.freeze({
				...step,
				...(step.newBlockAttrs ? { newBlockAttrs: snapshotBlockAttrs(step.newBlockAttrs) } : {}),
				...(step.path ? { path: snapshotPath(step.path) } : {}),
			});
		case 'mergeBlocks':
			return Object.freeze({
				...step,
				...(step.sourceAttrs ? { sourceAttrs: snapshotBlockAttrs(step.sourceAttrs) } : {}),
				...(step.path ? { path: snapshotPath(step.path) } : {}),
			});
		case 'addMark':
		case 'removeMark':
			return Object.freeze({
				...step,
				mark: snapshotMark(step.mark),
				...(step.path ? { path: snapshotPath(step.path) } : {}),
			});
		case 'setStoredMarks':
			return Object.freeze({
				...step,
				marks: snapshotOptionalMarks(step.marks),
				previousMarks: snapshotOptionalMarks(step.previousMarks),
			});
		case 'setBlockType':
			return Object.freeze({
				...step,
				...(step.attrs ? { attrs: snapshotBlockAttrs(step.attrs) } : {}),
				...(step.previousAttrs ? { previousAttrs: snapshotBlockAttrs(step.previousAttrs) } : {}),
				...(step.path ? { path: snapshotPath(step.path) } : {}),
			});
		case 'insertNode':
			return Object.freeze({
				...step,
				parentPath: snapshotPath(step.parentPath),
				node: snapshotBlockNode(step.node),
			});
		case 'removeNode':
			return Object.freeze({
				...step,
				parentPath: snapshotPath(step.parentPath),
				removedNode: snapshotBlockNode(step.removedNode),
			});
		case 'moveNode':
			return Object.freeze({
				...step,
				fromParentPath: snapshotPath(step.fromParentPath),
				toParentPath: snapshotPath(step.toParentPath),
				movedNode: snapshotBlockNode(step.movedNode),
			});
		case 'setNodeAttr':
			return Object.freeze({
				...step,
				path: snapshotPath(step.path),
				...(step.attrs ? { attrs: snapshotBlockAttrs(step.attrs) } : {}),
				...(step.previousAttrs ? { previousAttrs: snapshotBlockAttrs(step.previousAttrs) } : {}),
			});
		case 'insertInlineNode':
			return Object.freeze({
				...step,
				node: snapshotInlineNode(step.node),
				...(step.path ? { path: snapshotPath(step.path) } : {}),
			});
		case 'removeInlineNode':
			return Object.freeze({
				...step,
				removedNode: snapshotInlineNode(step.removedNode),
				...(step.path ? { path: snapshotPath(step.path) } : {}),
			});
		case 'setInlineNodeAttr':
			return Object.freeze({
				...step,
				attrs: snapshotInlineAttrs(step.attrs),
				previousAttrs: snapshotInlineAttrs(step.previousAttrs),
				...(step.path ? { path: snapshotPath(step.path) } : {}),
			});
	}
}

/**
 * Seals payloads already owned by the caller. Transactions whose maps were
 * computed against real document frames are privately branded so the terminal
 * finalizer can skip them without trusting a caller-applied shallow freeze.
 */
export function sealOwnedTransaction(
	parts: OwnedTransactionParts,
	options?: TransactionSealOptions,
): Transaction {
	if (parts.steps.length !== parts.forwardStepMaps.length) {
		throw new Error('A transaction requires exactly one forward StepMap per step.');
	}
	const transaction: Transaction = Object.freeze({
		steps: Object.freeze([...parts.steps]),
		selectionBefore: parts.selectionBefore,
		selectionAfter: parts.selectionAfter,
		storedMarksAfter: parts.storedMarksAfter,
		mapping: Mapping.from(parts.forwardStepMaps),
		forwardStepMaps: Object.freeze([...parts.forwardStepMaps]),
		metadata: Object.freeze({ ...parts.metadata }),
	});
	if (options?.mapsVerified !== false) VERIFIED_TRANSACTION_MAPS.add(transaction);
	return transaction;
}

/** True only for snapshots sealed here, never for shallow caller freezes. */
export function hasVerifiedTransactionMaps(transaction: Transaction): boolean {
	return VERIFIED_TRANSACTION_MAPS.has(transaction);
}

function snapshotMark(mark: Mark): Mark {
	const owned = cloneMark(mark);
	freezeMark(owned);
	return owned;
}

function snapshotBlockAttrs(attrs: BlockAttrs): BlockAttrs {
	const owned = cloneBlockAttrs(attrs);
	freezeBlockAttrs(owned);
	return owned;
}

function snapshotInlineAttrs(
	attrs: Readonly<Record<string, string | number | boolean>>,
): Readonly<Record<string, string | number | boolean>> {
	return Object.freeze({ ...attrs });
}

function snapshotBlockNode(node: BlockNode): BlockNode {
	const owned = cloneBlockNode(node);
	freezeBlockNode(owned);
	return owned;
}

function snapshotInlineNode(node: InlineNode): InlineNode {
	const owned = cloneInlineNode(node);
	freezeInlineNode(owned);
	return owned;
}

function snapshotSegments(segments: readonly ContentSegment[]): readonly ContentSegment[] {
	const owned = cloneContentSegments(segments);
	freezeContentSegments(owned);
	return owned;
}

function snapshotPath(path: readonly BlockId[]): readonly BlockId[] {
	return Object.freeze([...path]);
}
