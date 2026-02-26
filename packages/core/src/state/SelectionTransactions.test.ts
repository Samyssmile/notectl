import { describe, expect, it } from 'vitest';
import { isCollapsed, isNodeSelection } from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { stateBuilder } from '../test/TestUtils.js';
import { extendTx, moveTx, nodeSelTx } from './SelectionTransactions.js';

describe('SelectionTransactions', () => {
	describe('moveTx', () => {
		it('creates a collapsed cursor transaction', () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.paragraph('World', 'b2')
				.cursor('b1', 0)
				.build();

			const tx = moveTx(state, 'b2' as BlockId, 3);
			const next = state.apply(tx);

			expect(isCollapsed(next.selection)).toBe(true);
			expect(next.selection.anchor.blockId).toBe('b2');
			expect(next.selection.anchor.offset).toBe(3);
		});

		it('clears storedMarks', () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.cursor('b1', 3)
				.schema(['paragraph'], ['bold'])
				.build();

			const tx = moveTx(state, 'b1' as BlockId, 0);

			expect(tx.storedMarksAfter).toBeNull();
		});
	});

	describe('nodeSelTx', () => {
		it('creates a NodeSelection transaction', () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.paragraph('World', 'b2')
				.cursor('b1', 0)
				.build();

			const tx = nodeSelTx(state, 'b2' as BlockId);
			const next = state.apply(tx);

			expect(isNodeSelection(next.selection)).toBe(true);
		});
	});

	describe('extendTx', () => {
		it('creates a range selection transaction', () => {
			const state = stateBuilder()
				.paragraph('Hello', 'b1')
				.paragraph('World', 'b2')
				.cursor('b1', 0)
				.build();

			const tx = extendTx(state, 'b1' as BlockId, 0, 'b2' as BlockId, 3);
			const next = state.apply(tx);

			expect(isCollapsed(next.selection)).toBe(false);
			expect(next.selection.anchor.blockId).toBe('b1');
			expect(next.selection.anchor.offset).toBe(0);
			expect(next.selection.head.blockId).toBe('b2');
			expect(next.selection.head.offset).toBe(3);
		});
	});
});
