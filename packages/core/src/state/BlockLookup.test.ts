/**
 * Fix Verification: Block-Lookup uses lazy-cached Map and array.
 *
 * EditorState.getBlock() now uses a lazily-built Map — O(1) per lookup.
 * EditorState.getBlockOrder() caches the array after first call.
 * Both are safe because EditorState is immutable (private constructor,
 * every apply() creates a new instance).
 *
 * @see EditorState.ts
 */

import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { EditorState } from './EditorState.js';

// --- Helpers ---

function createLargeDocument(blockCount: number): EditorState {
	const blocks = Array.from({ length: blockCount }, (_, i) =>
		createBlockNode('paragraph', [createTextNode(`Block ${i}`)], `b${i}`),
	);
	const doc = createDocument(blocks);
	return EditorState.create({
		doc,
		selection: createCollapsedSelection('b0', 0),
	});
}

// --- Tests ---

describe('Fix Verification: Block-Lookup Lazy Cache', () => {
	describe('getBlock() uses Map for O(1) lookup', () => {
		it('getBlock() does not use Array.find()', () => {
			const state = createLargeDocument(100);
			const findSpy = vi.spyOn(state.doc.children, 'find');

			state.getBlock('b50');

			expect(findSpy).not.toHaveBeenCalled();
			findSpy.mockRestore();
		});

		it('getBlock() returns correct block for any position', () => {
			const state = createLargeDocument(1000);

			const first = state.getBlock('b0');
			const middle = state.getBlock('b500');
			const last = state.getBlock('b999');

			expect(first?.id).toBe('b0');
			expect(middle?.id).toBe('b500');
			expect(last?.id).toBe('b999');
		});

		it('getBlock() returns undefined for non-existent block', () => {
			const state = createLargeDocument(100);
			expect(state.getBlock('non-existent')).toBeUndefined();
		});

		it('repeated getBlock() calls reuse the same cache (lazy init once)', () => {
			const state = createLargeDocument(500);

			const b1 = state.getBlock('b250');
			const b2 = state.getBlock('b250');
			const b3 = state.getBlock('b100');

			// Same reference returned for same block
			expect(b1).toBe(b2);
			expect(b3?.id).toBe('b100');
		});
	});

	describe('getBlockOrder() caches the result', () => {
		it('getBlockOrder() returns the same reference on repeated calls', () => {
			const state = createLargeDocument(100);

			const order1 = state.getBlockOrder();
			const order2 = state.getBlockOrder();

			expect(order1).toBe(order2);
		});

		it('getBlockOrder() caches after first call', () => {
			const state = createLargeDocument(100);

			const order1 = state.getBlockOrder();
			const order2 = state.getBlockOrder();
			const order3 = state.getBlockOrder();

			// All return the same cached reference
			expect(order1).toBe(order2);
			expect(order2).toBe(order3);
		});

		it('getBlockOrder() returns correct IDs', () => {
			const state = createLargeDocument(5);

			const order = state.getBlockOrder();

			expect(order).toEqual(['b0', 'b1', 'b2', 'b3', 'b4']);
		});
	});

	describe('cache isolation between state instances', () => {
		it('new state from apply() has its own independent cache', () => {
			const state = createLargeDocument(10);

			// Warm up cache on original state
			const orderBefore = state.getBlockOrder();
			expect(orderBefore).toHaveLength(10);

			// Create new state via apply (split adds a block)
			const tr = state
				.transaction('input')
				.splitBlock('b5', 3, 'new-block')
				.setSelection(createCollapsedSelection('new-block', 0))
				.build();
			const newState = state.apply(tr);

			const orderAfter = newState.getBlockOrder();
			expect(orderAfter).toHaveLength(11);

			// Original state's cache is unaffected
			expect(state.getBlockOrder()).toBe(orderBefore);
			expect(state.getBlockOrder()).toHaveLength(10);
		});
	});
});
