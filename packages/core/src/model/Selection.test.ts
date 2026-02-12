import { describe, expect, it } from 'vitest';
import {
	createCollapsedSelection,
	createSelection,
	isCollapsed,
	isForward,
	selectionRange,
} from './Selection.js';

describe('Selection model', () => {
	describe('createCollapsedSelection', () => {
		it('creates a selection with same anchor and head', () => {
			const sel = createCollapsedSelection('block-1', 5);
			expect(sel.anchor).toEqual({ blockId: 'block-1', offset: 5 });
			expect(sel.head).toEqual({ blockId: 'block-1', offset: 5 });
		});
	});

	describe('createSelection', () => {
		it('creates a selection with different anchor and head', () => {
			const sel = createSelection(
				{ blockId: 'block-1', offset: 0 },
				{ blockId: 'block-1', offset: 5 },
			);
			expect(sel.anchor.offset).toBe(0);
			expect(sel.head.offset).toBe(5);
		});
	});

	describe('isCollapsed', () => {
		it('returns true for collapsed selection', () => {
			expect(isCollapsed(createCollapsedSelection('b1', 3))).toBe(true);
		});

		it('returns false for range selection', () => {
			const sel = createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 });
			expect(isCollapsed(sel)).toBe(false);
		});
	});

	describe('isForward', () => {
		it('returns true when anchor offset <= head offset in same block', () => {
			const sel = createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 });
			expect(isForward(sel)).toBe(true);
		});

		it('returns false for backward selection in same block', () => {
			const sel = createSelection({ blockId: 'b1', offset: 5 }, { blockId: 'b1', offset: 0 });
			expect(isForward(sel)).toBe(false);
		});

		it('uses blockOrder for cross-block selections', () => {
			const sel = createSelection({ blockId: 'b2', offset: 0 }, { blockId: 'b1', offset: 0 });
			expect(isForward(sel, ['b1', 'b2'])).toBe(false);
		});
	});

	describe('selectionRange', () => {
		it('normalizes forward selection', () => {
			const sel = createSelection({ blockId: 'b1', offset: 2 }, { blockId: 'b1', offset: 8 });
			const range = selectionRange(sel);
			expect(range.from.offset).toBe(2);
			expect(range.to.offset).toBe(8);
		});

		it('normalizes backward selection', () => {
			const sel = createSelection({ blockId: 'b1', offset: 8 }, { blockId: 'b1', offset: 2 });
			const range = selectionRange(sel);
			expect(range.from.offset).toBe(2);
			expect(range.to.offset).toBe(8);
		});
	});
});
