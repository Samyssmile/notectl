import { describe, expect, it } from 'vitest';
import type { NodeSpec } from '../model/NodeSpec.js';
import { isCollapsed, isNodeSelection } from '../model/Selection.js';
import type { Transaction } from '../state/Transaction.js';
import { assertDefined, stateBuilder } from '../test/TestUtils.js';
import { endOfTextblock, navigateAcrossBlocks } from './CaretNavigation.js';

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
