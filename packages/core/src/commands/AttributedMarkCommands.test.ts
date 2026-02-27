import { describe, expect, it } from 'vitest';
import { getBlockMarksAtOffset } from '../model/Document.js';
import type { Mark } from '../model/Document.js';
import { markType } from '../model/TypeBrands.js';
import type { MarkTypeName } from '../model/TypeBrands.js';
import { stateBuilder } from '../test/TestUtils.js';
import {
	applyAttributedMark,
	getMarkAttrAtSelection,
	isAttributedMarkActive,
	removeAttributedMark,
} from './AttributedMarkCommands.js';

/*
 * Tests use `textColor` (a real attributed mark with `{ color: string }`)
 * for realistic assertions. The plugin's module augmentation declares it
 * in MarkAttrRegistry, but since tests only need the raw mark shape we
 * simply pass the literal — no plugin import needed.
 */

const TEXT_COLOR: MarkTypeName = markType('textColor');
const colorMark = (color: string): Mark => ({
	type: TEXT_COLOR,
	attrs: { color },
});

// ---------------------------------------------------------------------------
// applyAttributedMark
// ---------------------------------------------------------------------------

describe('applyAttributedMark', () => {
	it('sets stored marks on collapsed cursor', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], ['bold', 'textColor'])
			.build();

		const tr = applyAttributedMark(state, colorMark('#ff0000'));
		if (!tr) return expect(tr).not.toBeNull();

		const next = state.apply(tr);
		expect(next.storedMarks).toContainEqual(colorMark('#ff0000'));
	});

	it('replaces existing mark of same type on collapsed cursor', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1', { marks: [colorMark('#00ff00')] })
			.cursor('b1', 3)
			.schema(['paragraph'], ['bold', 'textColor'])
			.build();

		const tr = applyAttributedMark(state, colorMark('#ff0000'));
		if (!tr) return expect(tr).not.toBeNull();

		const next = state.apply(tr);
		const colorMarks = next.storedMarks?.filter((m) => m.type === 'textColor') ?? [];
		expect(colorMarks).toHaveLength(1);
		expect(colorMarks[0]?.attrs).toEqual({ color: '#ff0000' });
	});

	it('preserves existing marks of other types on collapsed cursor', () => {
		const boldMark: Mark = { type: markType('bold') };
		const state = stateBuilder()
			.paragraph('Hello', 'b1', { marks: [boldMark, colorMark('#00ff00')] })
			.cursor('b1', 3)
			.schema(['paragraph'], ['bold', 'textColor'])
			.build();

		const tr = applyAttributedMark(state, colorMark('#ff0000'));
		if (!tr) return expect(tr).not.toBeNull();

		const next = state.apply(tr);
		expect(next.storedMarks).toContainEqual(boldMark);
	});

	it('applies mark across range selection', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
			.schema(['paragraph'], ['textColor'])
			.build();

		const tr = applyAttributedMark(state, colorMark('#ff0000'));
		if (!tr) return expect(tr).not.toBeNull();

		const next = state.apply(tr);
		const block = next.getBlock(next.selection.anchor.blockId);
		if (!block) return expect(block).toBeDefined();
		const marks: readonly Mark[] = getBlockMarksAtOffset(block, 2);
		expect(marks).toContainEqual(colorMark('#ff0000'));
	});

	it('applies mark across multi-block range', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.paragraph('World', 'b2')
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b2', offset: 5 })
			.schema(['paragraph'], ['textColor'])
			.build();

		const tr = applyAttributedMark(state, colorMark('#0000ff'));
		if (!tr) return expect(tr).not.toBeNull();

		const next = state.apply(tr);
		const child0 = next.doc.children[0];
		const child1 = next.doc.children[1];
		if (!child0 || !child1) return expect.unreachable();
		const block0 = next.getBlock(child0.id);
		const block1 = next.getBlock(child1.id);
		if (!block0 || !block1) return expect.unreachable();
		const m1: readonly Mark[] = getBlockMarksAtOffset(block0, 2);
		const m2: readonly Mark[] = getBlockMarksAtOffset(block1, 2);
		expect(m1).toContainEqual(colorMark('#0000ff'));
		expect(m2).toContainEqual(colorMark('#0000ff'));
	});

	it('returns null for node selection', () => {
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'b1')
			.nodeSelection('b1')
			.schema(['paragraph', 'horizontal_rule'], ['textColor'])
			.build();

		expect(applyAttributedMark(state, colorMark('#ff0000'))).toBeNull();
	});

	it('returns null for gap cursor', () => {
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'b1')
			.gapCursor('b1', 'before')
			.schema(['paragraph', 'horizontal_rule'], ['textColor'])
			.build();

		expect(applyAttributedMark(state, colorMark('#ff0000'))).toBeNull();
	});

	it('uses stored marks when present at collapsed cursor', () => {
		const existing: readonly Mark[] = [{ type: markType('bold') }];
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], ['bold', 'textColor'])
			.build();

		const withStored = state.apply(
			state
				.transaction('command')
				.setStoredMarks(existing, null)
				.setSelection(state.selection)
				.build(),
		);

		const tr = applyAttributedMark(withStored, colorMark('#ff0000'));
		if (!tr) return expect(tr).not.toBeNull();

		const next = withStored.apply(tr);
		expect(next.storedMarks).toContainEqual({ type: markType('bold') });
		expect(next.storedMarks).toContainEqual(colorMark('#ff0000'));
	});
});

// ---------------------------------------------------------------------------
// removeAttributedMark
// ---------------------------------------------------------------------------

describe('removeAttributedMark', () => {
	it('removes mark from stored marks at collapsed cursor', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1', { marks: [colorMark('#ff0000')] })
			.cursor('b1', 3)
			.schema(['paragraph'], ['textColor'])
			.build();

		const tr = removeAttributedMark(state, TEXT_COLOR);
		if (!tr) return expect(tr).not.toBeNull();

		const next = state.apply(tr);
		const colorMarks = next.storedMarks?.filter((m) => m.type === 'textColor') ?? [];
		expect(colorMarks).toHaveLength(0);
	});

	it('returns null when mark is absent at collapsed cursor', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], ['textColor'])
			.build();

		expect(removeAttributedMark(state, TEXT_COLOR)).toBeNull();
	});

	it('removes mark across range selection', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1', { marks: [colorMark('#ff0000')] })
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
			.schema(['paragraph'], ['textColor'])
			.build();

		const tr = removeAttributedMark(state, TEXT_COLOR);
		if (!tr) return expect(tr).not.toBeNull();

		const next = state.apply(tr);
		const child0 = next.doc.children[0];
		if (!child0) return expect.unreachable();
		const block = next.getBlock(child0.id);
		if (!block) return expect.unreachable();
		const marks: readonly Mark[] = getBlockMarksAtOffset(block, 2);
		expect(marks.some((m) => m.type === 'textColor')).toBe(false);
	});

	it('returns null for node selection', () => {
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'b1')
			.nodeSelection('b1')
			.schema(['paragraph', 'horizontal_rule'], ['textColor'])
			.build();

		expect(removeAttributedMark(state, TEXT_COLOR)).toBeNull();
	});

	it('returns null for gap cursor', () => {
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'b1')
			.gapCursor('b1', 'before')
			.schema(['paragraph', 'horizontal_rule'], ['textColor'])
			.build();

		expect(removeAttributedMark(state, TEXT_COLOR)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// getMarkAttrAtSelection
// ---------------------------------------------------------------------------

describe('getMarkAttrAtSelection', () => {
	it('extracts attr from mark at collapsed cursor', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1', { marks: [colorMark('#ff0000')] })
			.cursor('b1', 3)
			.schema(['paragraph'], ['textColor'])
			.build();

		const result = getMarkAttrAtSelection(state, 'textColor', (m) => m.attrs.color);
		expect(result).toBe('#ff0000');
	});

	it('returns null when mark is absent', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], ['textColor'])
			.build();

		const result = getMarkAttrAtSelection(state, 'textColor', (m) => m.attrs.color);
		expect(result).toBeNull();
	});

	it('extracts from stored marks when present', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], ['textColor'])
			.build();

		const withStored = state.apply(
			state
				.transaction('command')
				.setStoredMarks([colorMark('#00ff00')], null)
				.setSelection(state.selection)
				.build(),
		);

		const result = getMarkAttrAtSelection(withStored, 'textColor', (m) => m.attrs.color);
		expect(result).toBe('#00ff00');
	});

	it('extracts attr from range selection anchor block', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1', { marks: [colorMark('#0000ff')] })
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
			.schema(['paragraph'], ['textColor'])
			.build();

		const result = getMarkAttrAtSelection(state, 'textColor', (m) => m.attrs.color);
		expect(result).toBe('#0000ff');
	});

	it('returns null for node selection', () => {
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'b1')
			.nodeSelection('b1')
			.schema(['paragraph', 'horizontal_rule'], ['textColor'])
			.build();

		const result = getMarkAttrAtSelection(state, 'textColor', (m) => m.attrs.color);
		expect(result).toBeNull();
	});

	it('returns null for gap cursor', () => {
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'b1')
			.gapCursor('b1', 'before')
			.schema(['paragraph', 'horizontal_rule'], ['textColor'])
			.build();

		const result = getMarkAttrAtSelection(state, 'textColor', (m) => m.attrs.color);
		expect(result).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// isAttributedMarkActive
// ---------------------------------------------------------------------------

describe('isAttributedMarkActive', () => {
	it('returns true when mark is present', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1', { marks: [colorMark('#ff0000')] })
			.cursor('b1', 3)
			.schema(['paragraph'], ['textColor'])
			.build();

		expect(isAttributedMarkActive(state, 'textColor')).toBe(true);
	});

	it('returns false when mark is absent', () => {
		const state = stateBuilder()
			.paragraph('Hello', 'b1')
			.cursor('b1', 3)
			.schema(['paragraph'], ['textColor'])
			.build();

		expect(isAttributedMarkActive(state, 'textColor')).toBe(false);
	});

	it('returns false for node selection', () => {
		const state = stateBuilder()
			.voidBlock('horizontal_rule', 'b1')
			.nodeSelection('b1')
			.schema(['paragraph', 'horizontal_rule'], ['textColor'])
			.build();

		expect(isAttributedMarkActive(state, 'textColor')).toBe(false);
	});
});
