import { describe, expect, it } from 'vitest';
import {
	createCollapsedSelection,
	createNodeSelection,
	createSelection,
	isCollapsed,
	isForward,
	isNodeSelection,
	isTextSelection,
	selectionRange,
	selectionsEqual,
} from './Selection.js';
import type { BlockId } from './TypeBrands.js';

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

	describe('createNodeSelection', () => {
		it('creates a NodeSelection with correct type, nodeId, and path', () => {
			const nodeId: BlockId = 'b1' as BlockId;
			const path: readonly BlockId[] = ['root' as BlockId, 'b1' as BlockId];
			const sel = createNodeSelection(nodeId, path);
			expect(sel.type).toBe('node');
			expect(sel.nodeId).toBe('b1');
			expect(sel.path).toEqual(['root', 'b1']);
		});

		it('creates a NodeSelection with an empty path', () => {
			const nodeId: BlockId = 'b2' as BlockId;
			const path: readonly BlockId[] = [];
			const sel = createNodeSelection(nodeId, path);
			expect(sel.type).toBe('node');
			expect(sel.nodeId).toBe('b2');
			expect(sel.path).toEqual([]);
		});
	});

	describe('isNodeSelection', () => {
		it('returns true for a NodeSelection', () => {
			const sel = createNodeSelection('b1' as BlockId, ['root' as BlockId]);
			expect(isNodeSelection(sel)).toBe(true);
		});

		it('returns false for a text Selection', () => {
			const sel = createCollapsedSelection('b1', 0);
			expect(isNodeSelection(sel)).toBe(false);
		});

		it('returns false for a range text Selection', () => {
			const sel = createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 });
			expect(isNodeSelection(sel)).toBe(false);
		});
	});

	describe('isTextSelection', () => {
		it('returns true for a collapsed text Selection', () => {
			const sel = createCollapsedSelection('b1', 3);
			expect(isTextSelection(sel)).toBe(true);
		});

		it('returns true for a range text Selection', () => {
			const sel = createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b2', offset: 4 });
			expect(isTextSelection(sel)).toBe(true);
		});

		it('returns false for a NodeSelection', () => {
			const sel = createNodeSelection('b1' as BlockId, ['root' as BlockId]);
			expect(isTextSelection(sel)).toBe(false);
		});
	});

	describe('selectionsEqual', () => {
		it('returns true for equal NodeSelections', () => {
			const a = createNodeSelection('b1' as BlockId, ['root' as BlockId]);
			const b = createNodeSelection('b1' as BlockId, ['root' as BlockId]);
			expect(selectionsEqual(a, b)).toBe(true);
		});

		it('returns true for NodeSelections with same nodeId but different paths', () => {
			const a = createNodeSelection('b1' as BlockId, ['root' as BlockId]);
			const b = createNodeSelection('b1' as BlockId, ['other' as BlockId]);
			expect(selectionsEqual(a, b)).toBe(true);
		});

		it('returns false for different NodeSelections', () => {
			const a = createNodeSelection('b1' as BlockId, ['root' as BlockId]);
			const b = createNodeSelection('b2' as BlockId, ['root' as BlockId]);
			expect(selectionsEqual(a, b)).toBe(false);
		});

		it('returns true for equal text Selections', () => {
			const a = createSelection({ blockId: 'b1', offset: 2 }, { blockId: 'b1', offset: 7 });
			const b = createSelection({ blockId: 'b1', offset: 2 }, { blockId: 'b1', offset: 7 });
			expect(selectionsEqual(a, b)).toBe(true);
		});

		it('returns false for text Selections with different anchor offsets', () => {
			const a = createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 });
			const b = createSelection({ blockId: 'b1', offset: 1 }, { blockId: 'b1', offset: 5 });
			expect(selectionsEqual(a, b)).toBe(false);
		});

		it('returns false for text Selections with different head offsets', () => {
			const a = createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 });
			const b = createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 6 });
			expect(selectionsEqual(a, b)).toBe(false);
		});

		it('returns false for text Selections with different blockIds', () => {
			const a = createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 });
			const b = createSelection({ blockId: 'b2', offset: 0 }, { blockId: 'b2', offset: 5 });
			expect(selectionsEqual(a, b)).toBe(false);
		});

		it('returns false when comparing NodeSelection with text Selection', () => {
			const nodeSel = createNodeSelection('b1' as BlockId, ['root' as BlockId]);
			const textSel = createCollapsedSelection('b1', 0);
			expect(selectionsEqual(nodeSel, textSel)).toBe(false);
			expect(selectionsEqual(textSel, nodeSel)).toBe(false);
		});
	});

	describe('isCollapsed with NodeSelection', () => {
		it('returns false for a NodeSelection', () => {
			const sel = createNodeSelection('b1' as BlockId, ['root' as BlockId]);
			expect(isCollapsed(sel)).toBe(false);
		});
	});

	describe('isForward with NodeSelection', () => {
		it('returns true for a NodeSelection', () => {
			const sel = createNodeSelection('b1' as BlockId, ['root' as BlockId]);
			expect(isForward(sel)).toBe(true);
		});

		it('returns true for a NodeSelection even with blockOrder provided', () => {
			const sel = createNodeSelection('b1' as BlockId, ['root' as BlockId]);
			expect(isForward(sel, ['b2' as BlockId, 'b1' as BlockId])).toBe(true);
		});
	});
});
