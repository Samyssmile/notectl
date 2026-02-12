import { describe, expect, it } from 'vitest';
import { createCollapsedSelection } from '../model/Selection.js';
import { blockId } from '../model/TypeBrands.js';
import type { Transaction } from '../state/Transaction.js';
import { DecorationSet, decorationArraysEqual, inline, node, widget } from './Decoration.js';
import type {
	Decoration,
	InlineDecoration,
	NodeDecoration,
	WidgetDecoration,
} from './Decoration.js';

const B1 = blockId('b1');
const B2 = blockId('b2');
const B3 = blockId('b3');

describe('DecorationSet', () => {
	describe('create()', () => {
		it('returns empty for empty array', () => {
			const set = DecorationSet.create([]);
			expect(set.isEmpty).toBe(true);
			expect(set).toBe(DecorationSet.empty);
		});

		it('groups decorations by blockId', () => {
			const d1 = inline(B1, 0, 5, { class: 'highlight' });
			const d2 = inline(B1, 3, 8, { class: 'search' });
			const d3 = node(B2, { class: 'selected' });

			const set = DecorationSet.create([d1, d2, d3]);
			expect(set.find(B1)).toHaveLength(2);
			expect(set.find(B2)).toHaveLength(1);
			expect(set.find(B3)).toHaveLength(0);
		});
	});

	describe('find*()', () => {
		const inlineDeco = inline(B1, 0, 5, { class: 'hl' });
		const nodeDeco = node(B1, { class: 'sel' });
		const widgetDeco = widget(B1, 3, () => document.createElement('span'));
		const set = DecorationSet.create([inlineDeco, nodeDeco, widgetDeco]);

		it('find() returns all decorations for a block', () => {
			expect(set.find(B1)).toHaveLength(3);
		});

		it('findInline() returns only inline decorations', () => {
			const result: readonly InlineDecoration[] = set.findInline(B1);
			expect(result).toHaveLength(1);
			expect(result[0]?.type).toBe('inline');
		});

		it('findNode() returns only node decorations', () => {
			const result: readonly NodeDecoration[] = set.findNode(B1);
			expect(result).toHaveLength(1);
			expect(result[0]?.type).toBe('node');
		});

		it('findWidget() returns only widget decorations', () => {
			const result: readonly WidgetDecoration[] = set.findWidget(B1);
			expect(result).toHaveLength(1);
			expect(result[0]?.type).toBe('widget');
		});

		it('find*() returns empty array for unknown block', () => {
			expect(set.find(B3)).toHaveLength(0);
			expect(set.findInline(B3)).toHaveLength(0);
			expect(set.findNode(B3)).toHaveLength(0);
			expect(set.findWidget(B3)).toHaveLength(0);
		});
	});

	describe('add()', () => {
		it('returns new instance', () => {
			const set = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			const added = set.add([inline(B2, 0, 3, { class: 'b' })]);
			expect(added).not.toBe(set);
			expect(added.find(B1)).toHaveLength(1);
			expect(added.find(B2)).toHaveLength(1);
		});

		it('returns same instance when adding empty array', () => {
			const set = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			expect(set.add([])).toBe(set);
		});

		it('adds to existing block entries', () => {
			const set = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			const added = set.add([inline(B1, 3, 8, { class: 'b' })]);
			expect(added.find(B1)).toHaveLength(2);
		});

		it('creates from empty set', () => {
			const d = inline(B1, 0, 5, { class: 'a' });
			const result = DecorationSet.empty.add([d]);
			expect(result.find(B1)).toHaveLength(1);
		});
	});

	describe('remove()', () => {
		it('returns new instance without matching decorations', () => {
			const d1 = inline(B1, 0, 5, { class: 'a' });
			const d2 = inline(B1, 3, 8, { class: 'b' });
			const set = DecorationSet.create([d1, d2]);

			const removed = set.remove((d) => d.type === 'inline' && d.attrs.class === 'a');
			expect(removed).not.toBe(set);
			expect(removed.find(B1)).toHaveLength(1);
			expect(removed.findInline(B1)[0]?.attrs.class).toBe('b');
		});

		it('returns same instance when nothing matches', () => {
			const set = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			const removed = set.remove(() => false);
			expect(removed).toBe(set);
		});

		it('returns empty when all removed', () => {
			const set = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			const removed = set.remove(() => true);
			expect(removed.isEmpty).toBe(true);
			expect(removed).toBe(DecorationSet.empty);
		});
	});

	describe('merge()', () => {
		it('combines two sets', () => {
			const set1 = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			const set2 = DecorationSet.create([inline(B2, 0, 3, { class: 'b' })]);
			const merged = set1.merge(set2);

			expect(merged.find(B1)).toHaveLength(1);
			expect(merged.find(B2)).toHaveLength(1);
		});

		it('combines decorations for the same block', () => {
			const set1 = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			const set2 = DecorationSet.create([inline(B1, 3, 8, { class: 'b' })]);
			const merged = set1.merge(set2);

			expect(merged.find(B1)).toHaveLength(2);
		});

		it('returns this when merging with empty', () => {
			const set = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			expect(set.merge(DecorationSet.empty)).toBe(set);
		});

		it('returns other when this is empty', () => {
			const other = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			expect(DecorationSet.empty.merge(other)).toBe(other);
		});
	});

	describe('equals()', () => {
		it('returns true for same reference', () => {
			const set = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			expect(set.equals(set)).toBe(true);
		});

		it('returns true for structurally equal sets', () => {
			const d: readonly Decoration[] = [inline(B1, 0, 5, { class: 'a' })];
			const set1 = DecorationSet.create(d);
			const set2 = DecorationSet.create(d);
			expect(set1.equals(set2)).toBe(true);
		});

		it('returns false for different sizes', () => {
			const set1 = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			const set2 = DecorationSet.create([
				inline(B1, 0, 5, { class: 'a' }),
				inline(B2, 0, 3, { class: 'b' }),
			]);
			expect(set1.equals(set2)).toBe(false);
		});

		it('returns false for different attrs', () => {
			const set1 = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			const set2 = DecorationSet.create([inline(B1, 0, 5, { class: 'b' })]);
			expect(set1.equals(set2)).toBe(false);
		});

		it('both empty sets are equal', () => {
			expect(DecorationSet.empty.equals(DecorationSet.empty)).toBe(true);
			expect(DecorationSet.empty.equals(DecorationSet.create([]))).toBe(true);
		});
	});

	describe('isEmpty', () => {
		it('is true for empty set', () => {
			expect(DecorationSet.empty.isEmpty).toBe(true);
		});

		it('is false for non-empty set', () => {
			const set = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			expect(set.isEmpty).toBe(false);
		});
	});

	describe('map(tr)', () => {
		const dummySel = createCollapsedSelection(B1, 0);

		function makeTr(steps: Transaction['steps']): Transaction {
			return {
				steps,
				selectionBefore: dummySel,
				selectionAfter: dummySel,
				storedMarksAfter: null,
				metadata: { origin: 'input', timestamp: 0 },
			};
		}

		it('returns this when steps are empty', () => {
			const set = DecorationSet.create([inline(B1, 0, 5, { class: 'a' })]);
			const tr: Transaction = makeTr([]);
			expect(set.map(tr)).toBe(set);
		});

		it('returns this when set is empty', () => {
			const tr: Transaction = makeTr([
				{ type: 'insertText', blockId: B1, offset: 0, text: 'hi', marks: [] },
			]);
			expect(DecorationSet.empty.map(tr)).toBe(DecorationSet.empty);
		});

		it('maps decorations through insertText step', () => {
			const set = DecorationSet.create([inline(B1, 5, 10, { class: 'a' })]);
			const tr: Transaction = makeTr([
				{ type: 'insertText', blockId: B1, offset: 3, text: 'ab', marks: [] },
			]);
			const mapped = set.map(tr);
			const decos = mapped.findInline(B1);
			expect(decos).toHaveLength(1);
			expect(decos[0]?.from).toBe(7);
			expect(decos[0]?.to).toBe(12);
		});

		it('removes decorations that become invalid', () => {
			const set = DecorationSet.create([inline(B1, 3, 5, { class: 'a' })]);
			const tr: Transaction = makeTr([
				{
					type: 'deleteText',
					blockId: B1,
					from: 2,
					to: 8,
					deletedText: 'xxxxxx',
					deletedMarks: [],
					deletedSegments: [],
				},
			]);
			const mapped = set.map(tr);
			expect(mapped.isEmpty).toBe(true);
		});

		it('maps through multi-step transaction', () => {
			const set = DecorationSet.create([inline(B1, 5, 10, { class: 'a' })]);
			// Insert 3 chars at 0, then delete [1,4)
			const tr: Transaction = makeTr([
				{ type: 'insertText', blockId: B1, offset: 0, text: 'abc', marks: [] },
				{
					type: 'deleteText',
					blockId: B1,
					from: 1,
					to: 4,
					deletedText: 'bcx',
					deletedMarks: [],
					deletedSegments: [],
				},
			]);
			const mapped = set.map(tr);
			const decos = mapped.findInline(B1);
			expect(decos).toHaveLength(1);
			// After insert: [8,13). After delete [1,4): [5,10)
			expect(decos[0]?.from).toBe(5);
			expect(decos[0]?.to).toBe(10);
		});

		it('handles split producing two decorations', () => {
			const set = DecorationSet.create([inline(B1, 3, 8, { class: 'a' })]);
			const tr: Transaction = makeTr([
				{ type: 'splitBlock', blockId: B1, offset: 5, newBlockId: B2 },
			]);
			const mapped = set.map(tr);
			// Left part on B1
			const b1Decos = mapped.findInline(B1);
			expect(b1Decos).toHaveLength(1);
			expect(b1Decos[0]?.from).toBe(3);
			expect(b1Decos[0]?.to).toBe(5);
			// Right part on B2
			const b2Decos = mapped.findInline(B2);
			expect(b2Decos).toHaveLength(1);
			expect(b2Decos[0]?.from).toBe(0);
			expect(b2Decos[0]?.to).toBe(3);
		});

		it('removes decorations on removed node', () => {
			const set = DecorationSet.create([
				inline(B1, 0, 5, { class: 'a' }),
				inline(B2, 0, 3, { class: 'b' }),
			]);
			const tr: Transaction = makeTr([
				{
					type: 'removeNode',
					parentPath: [],
					index: 0,
					removedNode: {
						type: 'paragraph',
						id: B1,
						children: [],
						attrs: {},
					} as never,
				},
			]);
			const mapped = set.map(tr);
			expect(mapped.find(B1)).toHaveLength(0);
			expect(mapped.find(B2)).toHaveLength(1);
		});
	});
});

describe('decorationArraysEqual()', () => {
	it('returns true for same reference', () => {
		const arr: readonly Decoration[] = [inline(B1, 0, 5, { class: 'a' })];
		expect(decorationArraysEqual(arr, arr)).toBe(true);
	});

	it('returns true for structurally equal arrays', () => {
		const a: readonly Decoration[] = [inline(B1, 0, 5, { class: 'a' })];
		const b: readonly Decoration[] = [inline(B1, 0, 5, { class: 'a' })];
		expect(decorationArraysEqual(a, b)).toBe(true);
	});

	it('returns false for different lengths', () => {
		const a: readonly Decoration[] = [inline(B1, 0, 5, { class: 'a' })];
		const b: readonly Decoration[] = [];
		expect(decorationArraysEqual(a, b)).toBe(false);
	});

	it('compares node decorations correctly', () => {
		const a: readonly Decoration[] = [node(B1, { class: 'a' })];
		const b: readonly Decoration[] = [node(B1, { class: 'a' })];
		expect(decorationArraysEqual(a, b)).toBe(true);
	});

	it('compares widget decorations by identity', () => {
		const toDOM = () => document.createElement('span');
		const a: readonly Decoration[] = [widget(B1, 3, toDOM)];
		const b: readonly Decoration[] = [widget(B1, 3, toDOM)];
		expect(decorationArraysEqual(a, b)).toBe(true);

		const toDOM2 = () => document.createElement('span');
		const c: readonly Decoration[] = [widget(B1, 3, toDOM2)];
		expect(decorationArraysEqual(a, c)).toBe(false);
	});
});

describe('factory functions', () => {
	it('inline() creates correct shape', () => {
		const d = inline(B1, 2, 7, { class: 'hl', style: 'color: red' });
		expect(d.type).toBe('inline');
		expect(d.blockId).toBe(B1);
		expect(d.from).toBe(2);
		expect(d.to).toBe(7);
		expect(d.attrs.class).toBe('hl');
		expect(d.attrs.style).toBe('color: red');
	});

	it('node() creates correct shape', () => {
		const d = node(B2, { class: 'active', style: 'border: 1px solid' });
		expect(d.type).toBe('node');
		expect(d.blockId).toBe(B2);
		expect(d.attrs.class).toBe('active');
	});

	it('widget() creates correct shape with defaults', () => {
		const toDOM = () => document.createElement('div');
		const d = widget(B1, 5, toDOM);
		expect(d.type).toBe('widget');
		expect(d.offset).toBe(5);
		expect(d.side).toBe(-1);
		expect(d.key).toBeUndefined();
	});

	it('widget() accepts options', () => {
		const toDOM = () => document.createElement('div');
		const d = widget(B1, 5, toDOM, { side: 1, key: 'my-widget' });
		expect(d.side).toBe(1);
		expect(d.key).toBe('my-widget');
	});
});
