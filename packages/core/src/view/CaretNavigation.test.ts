import { describe, expect, it } from 'vitest';
import { createInlineNode, createTextNode } from '../model/Document.js';
import type { NodeSpec } from '../model/NodeSpec.js';
import { isCollapsed, isGapCursor, isNodeSelection, isTextSelection } from '../model/Selection.js';
import { inlineType, markType } from '../model/TypeBrands.js';
import type { Transaction } from '../state/Transaction.js';
import { assertDefined, stateBuilder } from '../test/TestUtils.js';
import {
	endOfTextblock,
	navigateAcrossBlocks,
	navigateFromGapCursor,
	skipInlineNode,
} from './CaretNavigation.js';

// --- Helpers ---

function nodeSpecLookup(type: string): NodeSpec | undefined {
	if (type === 'image') return { isVoid: true } as NodeSpec;
	if (type === 'table') return { isolating: true } as NodeSpec;
	if (type === 'table_cell') return { isolating: true } as NodeSpec;
	return undefined;
}

function dummyContainer(): HTMLElement {
	return document.createElement('div');
}

// --- endOfTextblock (fallback path, happy-dom has no Selection.modify) ---

describe('endOfTextblock', () => {
	it('returns true when cursor at offset 0 and direction is left', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], [])
			.build();

		expect(endOfTextblock(dummyContainer(), state, 'left')).toBe(true);
	});

	it('returns true when cursor at offset 0 and direction is up', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], [])
			.build();

		expect(endOfTextblock(dummyContainer(), state, 'up')).toBe(true);
	});

	it('returns false when cursor at offset > 0 and direction is left', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], [])
			.build();

		expect(endOfTextblock(dummyContainer(), state, 'left')).toBe(false);
	});

	it('returns true when cursor at block end and direction is right', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 5)
			.schema(['paragraph'], [])
			.build();

		expect(endOfTextblock(dummyContainer(), state, 'right')).toBe(true);
	});

	it('returns false when cursor before block end and direction is right', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], [])
			.build();

		expect(endOfTextblock(dummyContainer(), state, 'right')).toBe(false);
	});

	it('returns false for NodeSelection', () => {
		const state = stateBuilder()
			.block('image', '', 'img1', { attrs: { src: 'x.png', alt: '' } })
			.nodeSelection('img1')
			.schema(['image'], [])
			.build();

		expect(endOfTextblock(dummyContainer(), state, 'right')).toBe(false);
	});

	it('returns false for non-collapsed selection', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 3 })
			.schema(['paragraph'], [])
			.build();

		expect(endOfTextblock(dummyContainer(), state, 'right')).toBe(false);
	});

	it('returns true for down at block end (fallback)', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 5)
			.schema(['paragraph'], [])
			.build();

		expect(endOfTextblock(dummyContainer(), state, 'down')).toBe(true);
	});

	it('returns true for up at offset 0 (fallback)', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], [])
			.build();

		expect(endOfTextblock(dummyContainer(), state, 'up')).toBe(true);
	});

	it('falls back to offset heuristic for up/down mid-block', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], [])
			.build();

		// In happy-dom there's no Selection.modify, so fallback returns false
		expect(endOfTextblock(dummyContainer(), state, 'up')).toBe(false);
		expect(endOfTextblock(dummyContainer(), state, 'down')).toBe(false);
	});
});

// --- navigateAcrossBlocks ---

describe('navigateAcrossBlocks', () => {
	it('moves right from end of block 1 to start of block 2', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.paragraph('World', 'b2')
			.cursor('b1', 5)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = navigateAcrossBlocks(state, 'right');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isCollapsed(newState.selection)).toBe(true);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.blockId).toBe('b2');
			expect(newState.selection.anchor.offset).toBe(0);
		}
	});

	it('moves left from start of block 2 to end of block 1', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.paragraph('World', 'b2')
			.cursor('b2', 0)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = navigateAcrossBlocks(state, 'left');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.blockId).toBe('b1');
			expect(newState.selection.anchor.offset).toBe(5);
		}
	});

	it('returns null at document start for left', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], [])
			.build();

		expect(navigateAcrossBlocks(state, 'left')).toBeNull();
	});

	it('returns null at document end for right', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 5)
			.schema(['paragraph'], [])
			.build();

		expect(navigateAcrossBlocks(state, 'right')).toBeNull();
	});

	it('creates NodeSelection when target is void block', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.block('image', '', 'img1', { attrs: { src: 'x.png', alt: '' } })
			.cursor('b1', 5)
			.schema(['paragraph', 'image'], [], nodeSpecLookup)
			.build();

		const tr: Transaction | null = navigateAcrossBlocks(state, 'right');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(true);
		if (isNodeSelection(newState.selection)) {
			expect(newState.selection.nodeId).toBe('img1');
		}
	});

	it('returns null for NodeSelection (handled elsewhere)', () => {
		const state = stateBuilder()
			.block('image', '', 'img1', { attrs: { src: 'x.png', alt: '' } })
			.paragraph('After', 'b2')
			.nodeSelection('img1')
			.schema(['image', 'paragraph'], [], nodeSpecLookup)
			.build();

		expect(navigateAcrossBlocks(state, 'right')).toBeNull();
	});

	it('moves down using same logic as right (block-order traversal)', () => {
		const state = stateBuilder()
			.paragraph('Line 1', 'b1')
			.paragraph('Line 2', 'b2')
			.cursor('b1', 6)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = navigateAcrossBlocks(state, 'down');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.blockId).toBe('b2');
			expect(newState.selection.anchor.offset).toBe(0);
		}
	});

	it('moves up using same logic as left (block-order traversal)', () => {
		const state = stateBuilder()
			.paragraph('Line 1', 'b1')
			.paragraph('Line 2', 'b2')
			.cursor('b2', 0)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = navigateAcrossBlocks(state, 'up');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.blockId).toBe('b1');
			expect(newState.selection.anchor.offset).toBe(6);
		}
	});
});

// --- canCrossBlockBoundary (tested indirectly via navigateAcrossBlocks) ---

describe('canCrossBlockBoundary (via navigateAcrossBlocks)', () => {
	it('allows navigation between two top-level paragraphs', () => {
		const state = stateBuilder()
			.paragraph('A', 'b1')
			.paragraph('B', 'b2')
			.cursor('b1', 1)
			.schema(['paragraph'], [])
			.build();

		expect(navigateAcrossBlocks(state, 'right')).not.toBeNull();
	});

	it('blocks navigation when target block is isolating', () => {
		const state = stateBuilder()
			.paragraph('A', 'b1')
			.block('table', '', 'tbl1')
			.cursor('b1', 1)
			.schema(['paragraph', 'table'], [], nodeSpecLookup)
			.build();

		expect(navigateAcrossBlocks(state, 'right')).toBeNull();
	});

	it('blocks navigation when source block is isolating', () => {
		const state = stateBuilder()
			.block('table', '', 'tbl1')
			.paragraph('A', 'b1')
			.cursor('tbl1', 0)
			.schema(['table', 'paragraph'], [], nodeSpecLookup)
			.build();

		expect(navigateAcrossBlocks(state, 'right')).toBeNull();
	});
});

// --- skipInlineNode ---

describe('skipInlineNode', () => {
	const br = () => createInlineNode(inlineType('hard_break'));
	const txt = (s: string) => createTextNode(s);

	it('skips right over InlineNode at middle of block', () => {
		// "He" + <br> + "llo" → cursor at offset 2 (on the br)
		const state = stateBuilder()
			.blockWithInlines('paragraph', [txt('He'), br(), txt('llo')], 'b1')
			.cursor('b1', 2)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = skipInlineNode(state, 'right');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(false);
		expect(isCollapsed(newState.selection)).toBe(true);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.blockId).toBe('b1');
			expect(newState.selection.anchor.offset).toBe(3);
		}
	});

	it('skips left over InlineNode at middle of block', () => {
		// "He" + <br> + "llo" → cursor at offset 3 (just after br)
		const state = stateBuilder()
			.blockWithInlines('paragraph', [txt('He'), br(), txt('llo')], 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = skipInlineNode(state, 'left');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(false);
		expect(isCollapsed(newState.selection)).toBe(true);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.blockId).toBe('b1');
			expect(newState.selection.anchor.offset).toBe(2);
		}
	});

	it('skips right over InlineNode at start of block', () => {
		// <br> + "text" → cursor at offset 0
		const state = stateBuilder()
			.blockWithInlines('paragraph', [br(), txt('text')], 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = skipInlineNode(state, 'right');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(false);
		expect(isCollapsed(newState.selection)).toBe(true);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.offset).toBe(1);
		}
	});

	it('skips left after InlineNode at start of block', () => {
		// <br> + "text" → cursor at offset 1
		const state = stateBuilder()
			.blockWithInlines('paragraph', [br(), txt('text')], 'b1')
			.cursor('b1', 1)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = skipInlineNode(state, 'left');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(false);
		expect(isCollapsed(newState.selection)).toBe(true);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.offset).toBe(0);
		}
	});

	it('skips right over InlineNode at end of block', () => {
		// "text" + <br> → cursor at offset 4 (on the br)
		const state = stateBuilder()
			.blockWithInlines('paragraph', [txt('text'), br()], 'b1')
			.cursor('b1', 4)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = skipInlineNode(state, 'right');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(false);
		expect(isCollapsed(newState.selection)).toBe(true);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.offset).toBe(5);
		}
	});

	it('skips left from after InlineNode at end of block', () => {
		// "text" + <br> → cursor at offset 5 (block end)
		const state = stateBuilder()
			.blockWithInlines('paragraph', [txt('text'), br()], 'b1')
			.cursor('b1', 5)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = skipInlineNode(state, 'left');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(false);
		expect(isCollapsed(newState.selection)).toBe(true);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.offset).toBe(4);
		}
	});

	it('skips first of adjacent InlineNodes rightward', () => {
		// "A" + <br> + <br> + "B" → cursor at offset 1
		const state = stateBuilder()
			.blockWithInlines('paragraph', [txt('A'), br(), br(), txt('B')], 'b1')
			.cursor('b1', 1)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = skipInlineNode(state, 'right');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(false);
		expect(isCollapsed(newState.selection)).toBe(true);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.offset).toBe(2);
		}
	});

	it('skips second of adjacent InlineNodes rightward', () => {
		// "A" + <br> + <br> + "B" → cursor at offset 2 (between the two brs)
		const state = stateBuilder()
			.blockWithInlines('paragraph', [txt('A'), br(), br(), txt('B')], 'b1')
			.cursor('b1', 2)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = skipInlineNode(state, 'right');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(false);
		expect(isCollapsed(newState.selection)).toBe(true);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.offset).toBe(3);
		}
	});

	it('skips left from between adjacent InlineNodes', () => {
		// "A" + <br> + <br> + "B" → cursor at offset 2 (between the two brs)
		const state = stateBuilder()
			.blockWithInlines('paragraph', [txt('A'), br(), br(), txt('B')], 'b1')
			.cursor('b1', 2)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = skipInlineNode(state, 'left');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(false);
		expect(isCollapsed(newState.selection)).toBe(true);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.offset).toBe(1);
		}
	});

	it('returns null for vertical directions (up)', () => {
		const state = stateBuilder()
			.blockWithInlines('paragraph', [txt('A'), br(), txt('B')], 'b1')
			.cursor('b1', 1)
			.schema(['paragraph'], [])
			.build();

		expect(skipInlineNode(state, 'up')).toBeNull();
	});

	it('returns null for vertical directions (down)', () => {
		const state = stateBuilder()
			.blockWithInlines('paragraph', [txt('A'), br(), txt('B')], 'b1')
			.cursor('b1', 1)
			.schema(['paragraph'], [])
			.build();

		expect(skipInlineNode(state, 'down')).toBeNull();
	});

	it('returns null when no InlineNode adjacent (ArrowRight)', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 2)
			.schema(['paragraph'], [])
			.build();

		expect(skipInlineNode(state, 'right')).toBeNull();
	});

	it('returns null when no InlineNode adjacent (ArrowLeft)', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 2)
			.schema(['paragraph'], [])
			.build();

		expect(skipInlineNode(state, 'left')).toBeNull();
	});

	it('returns null for NodeSelection', () => {
		const state = stateBuilder()
			.block('image', '', 'img1', { attrs: { src: 'x.png', alt: '' } })
			.nodeSelection('img1')
			.schema(['image'], [])
			.build();

		expect(skipInlineNode(state, 'right')).toBeNull();
	});

	it('returns null for non-collapsed selection', () => {
		const state = stateBuilder()
			.blockWithInlines('paragraph', [txt('He'), br(), txt('llo')], 'b1')
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 3 })
			.schema(['paragraph'], [])
			.build();

		expect(skipInlineNode(state, 'right')).toBeNull();
	});

	it('skips right when block is only an InlineNode', () => {
		// Just <br> → cursor at offset 0
		const state = stateBuilder()
			.blockWithInlines('paragraph', [br()], 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = skipInlineNode(state, 'right');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(false);
		expect(isCollapsed(newState.selection)).toBe(true);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.offset).toBe(1);
		}
	});

	it('skips left when block is only an InlineNode', () => {
		// Just <br> → cursor at offset 1 (end)
		const state = stateBuilder()
			.blockWithInlines('paragraph', [br()], 'b1')
			.cursor('b1', 1)
			.schema(['paragraph'], [])
			.build();

		const tr: Transaction | null = skipInlineNode(state, 'left');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(false);
		expect(isCollapsed(newState.selection)).toBe(true);
		if (!isNodeSelection(newState.selection)) {
			expect(newState.selection.anchor.offset).toBe(0);
		}
	});

	it('returns null at block boundary (offset 0, ArrowLeft)', () => {
		const state = stateBuilder()
			.blockWithInlines('paragraph', [br(), txt('x')], 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], [])
			.build();

		expect(skipInlineNode(state, 'left')).toBeNull();
	});

	it('returns null past block end (offset blockLength, ArrowRight)', () => {
		// "text" + <br> → blockLength is 5, cursor at 5
		const state = stateBuilder()
			.blockWithInlines('paragraph', [txt('text'), br()], 'b1')
			.cursor('b1', 5)
			.schema(['paragraph'], [])
			.build();

		// At offset 5 (past the br at 4), getContentAtOffset returns null
		expect(skipInlineNode(state, 'right')).toBeNull();
	});

	it('clears storedMarks after skip right', () => {
		const state = stateBuilder()
			.blockWithInlines('paragraph', [txt('He'), br(), txt('llo')], 'b1')
			.cursor('b1', 2)
			.schema(['paragraph'], ['bold'])
			.build();

		// Simulate bold being toggled: set storedMarks on state
		const boldMark = { type: markType('bold') };
		const stateWithMarks = state.apply(
			state.transaction('input').setStoredMarks([boldMark], null).build(),
		);
		expect(stateWithMarks.storedMarks).not.toBeNull();

		const tr: Transaction | null = skipInlineNode(stateWithMarks, 'right');
		assertDefined(tr, 'expected transaction');

		const newState = stateWithMarks.apply(tr);
		expect(newState.storedMarks).toBeNull();
	});

	it('clears storedMarks after skip left', () => {
		const state = stateBuilder()
			.blockWithInlines('paragraph', [txt('He'), br(), txt('llo')], 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], ['bold'])
			.build();

		// Simulate bold being toggled: set storedMarks on state
		const boldMark = { type: markType('bold') };
		const stateWithMarks = state.apply(
			state.transaction('input').setStoredMarks([boldMark], null).build(),
		);
		expect(stateWithMarks.storedMarks).not.toBeNull();

		const tr: Transaction | null = skipInlineNode(stateWithMarks, 'left');
		assertDefined(tr, 'expected transaction');

		const newState = stateWithMarks.apply(tr);
		expect(newState.storedMarks).toBeNull();
	});
});

// --- navigateFromGapCursor ---

describe('navigateFromGapCursor', () => {
	it('arrow toward void (side=before, right) → NodeSelection', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.voidBlock('image', 'img1')
			.paragraph('World', 'b2')
			.gapCursor('img1', 'before')
			.schema(['paragraph', 'image'], [], nodeSpecLookup)
			.build();

		const tr = navigateFromGapCursor(state, 'right');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(true);
		if (isNodeSelection(newState.selection)) {
			expect(newState.selection.nodeId).toBe('img1');
		}
	});

	it('arrow toward void (side=after, left) → NodeSelection', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.voidBlock('image', 'img1')
			.paragraph('World', 'b2')
			.gapCursor('img1', 'after')
			.schema(['paragraph', 'image'], [], nodeSpecLookup)
			.build();

		const tr = navigateFromGapCursor(state, 'left');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(true);
		if (isNodeSelection(newState.selection)) {
			expect(newState.selection.nodeId).toBe('img1');
		}
	});

	it('arrow away (side=before, left) → TextSelection at end of prev block', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.voidBlock('image', 'img1')
			.paragraph('World', 'b2')
			.gapCursor('img1', 'before')
			.schema(['paragraph', 'image'], [], nodeSpecLookup)
			.build();

		const tr = navigateFromGapCursor(state, 'left');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isTextSelection(newState.selection)).toBe(true);
		if (isTextSelection(newState.selection)) {
			expect(newState.selection.anchor.blockId).toBe('b1');
			expect(newState.selection.anchor.offset).toBe(5);
		}
	});

	it('arrow away (side=after, right) → TextSelection at start of next block', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.voidBlock('image', 'img1')
			.paragraph('World', 'b2')
			.gapCursor('img1', 'after')
			.schema(['paragraph', 'image'], [], nodeSpecLookup)
			.build();

		const tr = navigateFromGapCursor(state, 'right');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isTextSelection(newState.selection)).toBe(true);
		if (isTextSelection(newState.selection)) {
			expect(newState.selection.anchor.blockId).toBe('b2');
			expect(newState.selection.anchor.offset).toBe(0);
		}
	});

	it('returns null at document boundary (away direction)', () => {
		const state = stateBuilder()
			.voidBlock('image', 'img1')
			.paragraph('Hello', 'b1')
			.gapCursor('img1', 'before')
			.schema(['paragraph', 'image'], [], nodeSpecLookup)
			.build();

		const tr = navigateFromGapCursor(state, 'left');
		expect(tr).toBeNull();
	});

	it('returns null for non-GapCursor selection', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], [])
			.build();

		expect(navigateFromGapCursor(state, 'right')).toBeNull();
	});

	it('arrow away toward adjacent void → NodeSelection of that void', () => {
		const state = stateBuilder()
			.voidBlock('image', 'img1')
			.voidBlock('image', 'img2')
			.paragraph('Hello', 'b1')
			.gapCursor('img2', 'after')
			.schema(['paragraph', 'image'], [], nodeSpecLookup)
			.build();

		const tr = navigateFromGapCursor(state, 'right');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isTextSelection(newState.selection)).toBe(true);
		if (isTextSelection(newState.selection)) {
			expect(newState.selection.anchor.blockId).toBe('b1');
		}
	});

	it('down from gap cursor before void → NodeSelection', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.voidBlock('image', 'img1')
			.gapCursor('img1', 'before')
			.schema(['paragraph', 'image'], [], nodeSpecLookup)
			.build();

		const tr = navigateFromGapCursor(state, 'down');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(true);
	});

	it('up from gap cursor after void → NodeSelection', () => {
		const state = stateBuilder()
			.voidBlock('image', 'img1')
			.paragraph('Hello', 'b1')
			.gapCursor('img1', 'after')
			.schema(['paragraph', 'image'], [], nodeSpecLookup)
			.build();

		const tr = navigateFromGapCursor(state, 'up');
		assertDefined(tr, 'expected transaction');

		const newState = state.apply(tr);
		expect(isNodeSelection(newState.selection)).toBe(true);
	});
});
