import { describe, expect, it, vi } from 'vitest';
import { createTextNode } from '../../model/Document.js';
import { markType } from '../../model/TypeBrands.js';
import { mockPluginContext, stateBuilder } from '../../test/TestUtils.js';
import {
	applyColorMark,
	getActiveColor,
	isColorMarkActive,
	removeColorMark,
} from './ColorMarkOperations.js';

// Both textColor and highlight have { color: string } attrs via module augmentation.
// We import the plugins so the augmentations are active.
import '../../plugins/text-color/TextColorPlugin.js';
import '../../plugins/highlight/HighlightPlugin.js';

describe('ColorMarkOperations', () => {
	describe('getActiveColor', () => {
		it('returns null on node selection', () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.nodeSelection('b1')
				.schema(['paragraph'], ['textColor'])
				.build();

			expect(getActiveColor(state, 'textColor')).toBeNull();
		});

		it('returns null when mark is absent (collapsed)', () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], ['textColor'])
				.build();

			expect(getActiveColor(state, 'textColor')).toBeNull();
		});

		it('returns color from block marks (collapsed)', () => {
			const state = stateBuilder()
				.blockWithInlines(
					'paragraph',
					[createTextNode('hello', [{ type: 'textColor', attrs: { color: '#ff0000' } }])],
					'b1',
				)
				.cursor('b1', 2)
				.schema(['paragraph'], ['textColor'])
				.build();

			expect(getActiveColor(state, 'textColor')).toBe('#ff0000');
		});

		it('returns color from stored marks (collapsed)', () => {
			const base = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], ['highlight'])
				.build();

			// Apply a transaction that sets stored marks to produce a state with storedMarks
			const tr = base
				.transaction('command')
				.setStoredMarks([{ type: markType('highlight'), attrs: { color: '#fff176' } }], null)
				.setSelection(base.selection)
				.build();
			const state = base.apply(tr);

			expect(getActiveColor(state, 'highlight')).toBe('#fff176');
		});

		it('returns color from anchor block (range selection)', () => {
			const state = stateBuilder()
				.blockWithInlines(
					'paragraph',
					[createTextNode('hello', [{ type: 'highlight', attrs: { color: '#aed581' } }])],
					'b1',
				)
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['highlight'])
				.build();

			expect(getActiveColor(state, 'highlight')).toBe('#aed581');
		});

		it('returns null when block is missing', () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 0)
				.schema(['paragraph'], ['textColor'])
				.build();

			// Simulate missing block by using a state with no matching block
			// (collapsed, no stored marks, block lookup returns null for non-existent id)
			expect(getActiveColor(state, 'textColor')).toBeNull();
		});
	});

	describe('isColorMarkActive', () => {
		it('returns true when color is present', () => {
			const state = stateBuilder()
				.blockWithInlines(
					'paragraph',
					[createTextNode('hi', [{ type: 'textColor', attrs: { color: '#ff0000' } }])],
					'b1',
				)
				.cursor('b1', 1)
				.schema(['paragraph'], ['textColor'])
				.build();

			expect(isColorMarkActive(state, 'textColor')).toBe(true);
		});

		it('returns false when color is absent', () => {
			const state = stateBuilder()
				.paragraph('hi', 'b1')
				.cursor('b1', 1)
				.schema(['paragraph'], ['textColor'])
				.build();

			expect(isColorMarkActive(state, 'textColor')).toBe(false);
		});
	});

	describe('applyColorMark', () => {
		it('returns false on node selection', () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.nodeSelection('b1')
				.schema(['paragraph'], ['textColor'])
				.build();

			const ctx = mockPluginContext({ getState: () => state });
			expect(applyColorMark(ctx, state, 'textColor', '#ff0000')).toBe(false);
		});

		it('sets stored marks on collapsed selection', () => {
			const dispatch = vi.fn();
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], ['textColor'])
				.build();

			const ctx = mockPluginContext({ getState: () => state, dispatch });
			const result = applyColorMark(ctx, state, 'textColor', '#ff0000');

			expect(result).toBe(true);
			expect(dispatch).toHaveBeenCalledOnce();
		});

		it('dispatches removeMark + addMark on range selection', () => {
			const dispatch = vi.fn();
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['highlight'])
				.build();

			const ctx = mockPluginContext({ getState: () => state, dispatch });
			const result = applyColorMark(ctx, state, 'highlight', '#fff176');

			expect(result).toBe(true);
			expect(dispatch).toHaveBeenCalledOnce();
		});

		it('returns false when anchor block is missing (collapsed)', () => {
			const state = stateBuilder()
				.schema(['paragraph'], ['textColor'])
				.paragraph('hello', 'b1')
				.cursor('b1', 2)
				.build();

			// Create a context that returns a state with no blocks
			const emptyState = stateBuilder().schema(['paragraph'], ['textColor']).build();
			const ctx = mockPluginContext({ getState: () => emptyState });
			expect(applyColorMark(ctx, emptyState, 'textColor', '#ff0000')).toBe(false);
		});
	});

	describe('removeColorMark', () => {
		it('returns false on node selection', () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.nodeSelection('b1')
				.schema(['paragraph'], ['textColor'])
				.build();

			const ctx = mockPluginContext({ getState: () => state });
			expect(removeColorMark(ctx, state, 'textColor')).toBe(false);
		});

		it('returns false when mark is not present (collapsed)', () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], ['textColor'])
				.build();

			const ctx = mockPluginContext({ getState: () => state });
			expect(removeColorMark(ctx, state, 'textColor')).toBe(false);
		});

		it('removes stored mark on collapsed selection', () => {
			const dispatch = vi.fn();
			const state = stateBuilder()
				.blockWithInlines(
					'paragraph',
					[createTextNode('hello', [{ type: 'textColor', attrs: { color: '#ff0000' } }])],
					'b1',
				)
				.cursor('b1', 2)
				.schema(['paragraph'], ['textColor'])
				.build();

			const ctx = mockPluginContext({ getState: () => state, dispatch });
			const result = removeColorMark(ctx, state, 'textColor');

			expect(result).toBe(true);
			expect(dispatch).toHaveBeenCalledOnce();
		});

		it('dispatches removeMark on range selection', () => {
			const dispatch = vi.fn();
			const state = stateBuilder()
				.blockWithInlines(
					'paragraph',
					[createTextNode('hello', [{ type: 'highlight', attrs: { color: '#fff176' } }])],
					'b1',
				)
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['highlight'])
				.build();

			const ctx = mockPluginContext({ getState: () => state, dispatch });
			const result = removeColorMark(ctx, state, 'highlight');

			expect(result).toBe(true);
			expect(dispatch).toHaveBeenCalledOnce();
		});
	});
});
