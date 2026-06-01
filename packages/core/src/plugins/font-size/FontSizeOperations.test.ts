import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createInlineNode } from '../../model/Document.js';
import type { InlineNodeSpec } from '../../model/InlineNodeSpec.js';
import type { NodeSpec } from '../../model/NodeSpec.js';
import type { Schema } from '../../model/Schema.js';
import { createNodeSelection, createSelection } from '../../model/Selection.js';
import { blockId, inlineType, nodeType } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import { mockPluginContext, stateBuilder } from '../../test/TestUtils.js';
import {
	applyFontSize,
	getActiveSize,
	getActiveSizeNumeric,
	getNextPresetSize,
	isFontSizeActive,
	removeFontSize,
	selectSize,
	stepFontSize,
} from './FontSizeOperations.js';

// A schema where `math_display`/`math_inline` opt into a node-level fontSize attr,
// while `paragraph` does not. Mirrors how the formula plugin declares the attr.
const FORMULA_SCHEMA: Schema = {
	nodeTypes: ['paragraph', 'math_display'],
	markTypes: ['fontSize'],
	getNodeSpec: (type: string) =>
		type === 'math_display'
			? ({ attrs: { fontSize: { default: '' }, mathml: { default: '' } } } as unknown as NodeSpec)
			: undefined,
	getInlineNodeSpec: (type: string) =>
		type === 'math_inline'
			? ({
					attrs: { fontSize: { default: '' }, mathml: { default: '' } },
				} as unknown as InlineNodeSpec)
			: undefined,
};

function displayFormulaState(attrs: Record<string, string>): EditorState {
	const block = createBlockNode(nodeType('math_display'), [], blockId('m1'), attrs);
	return EditorState.create({
		doc: createDocument([block]),
		selection: createNodeSelection(blockId('m1'), []),
		schema: FORMULA_SCHEMA,
	});
}

function inlineFormulaState(attrs: Record<string, string>): EditorState {
	const inline = createInlineNode(inlineType('math_inline'), attrs);
	const block = createBlockNode(nodeType('paragraph'), [inline], blockId('b1'));
	return EditorState.create({
		doc: createDocument([block]),
		selection: createSelection(
			{ blockId: blockId('b1'), offset: 0 },
			{ blockId: blockId('b1'), offset: 1 },
		),
		schema: FORMULA_SCHEMA,
	});
}

// --- State Queries ---

describe('getActiveSize', () => {
	it('returns null when no fontSize mark is present', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.cursor('b1', 2)
			.schema(['paragraph'], ['fontSize'])
			.build();

		expect(getActiveSize(state)).toBeNull();
	});

	it('returns the size string when fontSize mark is present', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1', {
				marks: [{ type: 'fontSize', attrs: { size: '24px' } }],
			})
			.cursor('b1', 2)
			.schema(['paragraph'], ['fontSize'])
			.build();

		expect(getActiveSize(state)).toBe('24px');
	});

	it('returns size from stored marks when present on collapsed selection', () => {
		const base = stateBuilder()
			.paragraph('hello', 'b1')
			.cursor('b1', 2)
			.schema(['paragraph'], ['fontSize'])
			.build();

		const tr = base
			.transaction('command')
			.setStoredMarks([{ type: 'fontSize' as const, attrs: { size: '32px' } }], base.storedMarks)
			.setSelection(base.selection)
			.build();
		const state = base.apply(tr);

		expect(getActiveSize(state)).toBe('32px');
	});

	it('reads from anchor position on range selection', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1', {
				marks: [{ type: 'fontSize', attrs: { size: '18px' } }],
			})
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
			.schema(['paragraph'], ['fontSize'])
			.build();

		expect(getActiveSize(state)).toBe('18px');
	});
});

describe('getActiveSizeNumeric', () => {
	it('returns defaultSize when no mark is present', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], ['fontSize'])
			.build();

		expect(getActiveSizeNumeric(state, 16)).toBe(16);
	});

	it('parses numeric value from mark size string', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1', {
				marks: [{ type: 'fontSize', attrs: { size: '24px' } }],
			})
			.cursor('b1', 2)
			.schema(['paragraph'], ['fontSize'])
			.build();

		expect(getActiveSizeNumeric(state, 16)).toBe(24);
	});

	it('returns defaultSize for unparseable values', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1', {
				marks: [{ type: 'fontSize', attrs: { size: 'invalid' } }],
			})
			.cursor('b1', 2)
			.schema(['paragraph'], ['fontSize'])
			.build();

		expect(getActiveSizeNumeric(state, 16)).toBe(16);
	});

	it('uses provided defaultSize, not hardcoded 16', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], ['fontSize'])
			.build();

		expect(getActiveSizeNumeric(state, 12)).toBe(12);
	});
});

describe('isFontSizeActive', () => {
	it('returns false when no fontSize mark is present', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.cursor('b1', 0)
			.schema(['paragraph'], ['fontSize'])
			.build();

		expect(isFontSizeActive(state)).toBe(false);
	});

	it('returns true when fontSize mark is present', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1', {
				marks: [{ type: 'fontSize', attrs: { size: '24px' } }],
			})
			.cursor('b1', 2)
			.schema(['paragraph'], ['fontSize'])
			.build();

		expect(isFontSizeActive(state)).toBe(true);
	});
});

// --- Commands ---

describe('applyFontSize', () => {
	it('dispatches a transaction with addMark steps for range selection', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
			.schema(['paragraph'], ['fontSize'])
			.build();

		const dispatch = vi.fn();
		const ctx = mockPluginContext({ getState: () => state, dispatch });

		const result: boolean = applyFontSize(ctx, state, '24px');

		expect(result).toBe(true);
		expect(dispatch).toHaveBeenCalledOnce();

		const tr = dispatch.mock.calls[0]?.[0];
		const addMarkStep = tr.steps.find((s: { type: string }) => s.type === 'addMark');
		expect(addMarkStep).toBeDefined();
		expect(addMarkStep.mark.attrs.size).toBe('24px');
	});

	it('sets stored marks for collapsed selection', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.cursor('b1', 2)
			.schema(['paragraph'], ['fontSize'])
			.build();

		const dispatch = vi.fn();
		const ctx = mockPluginContext({ getState: () => state, dispatch });

		const result: boolean = applyFontSize(ctx, state, '32px');

		expect(result).toBe(true);
		expect(dispatch).toHaveBeenCalledOnce();

		const tr = dispatch.mock.calls[0]?.[0];
		const setStoredStep = tr.steps.find((s: { type: string }) => s.type === 'setStoredMarks');
		expect(setStoredStep).toBeDefined();
	});

	it('returns false for node selection', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.nodeSelection('b1')
			.schema(['paragraph'], ['fontSize'])
			.build();

		const ctx = mockPluginContext({ getState: () => state, dispatch: vi.fn() });

		expect(applyFontSize(ctx, state, '24px')).toBe(false);
	});
});

describe('removeFontSize', () => {
	it('dispatches removeMark for range selection with fontSize', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1', {
				marks: [{ type: 'fontSize', attrs: { size: '24px' } }],
			})
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
			.schema(['paragraph'], ['fontSize'])
			.build();

		const dispatch = vi.fn();
		const ctx = mockPluginContext({ getState: () => state, dispatch });

		const result: boolean = removeFontSize(ctx, state);

		expect(result).toBe(true);
		expect(dispatch).toHaveBeenCalledOnce();

		const tr = dispatch.mock.calls[0]?.[0];
		const removeMarkStep = tr.steps.find((s: { type: string }) => s.type === 'removeMark');
		expect(removeMarkStep).toBeDefined();
	});

	it('returns false when collapsed selection has no fontSize mark', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.cursor('b1', 2)
			.schema(['paragraph'], ['fontSize'])
			.build();

		const ctx = mockPluginContext({ getState: () => state, dispatch: vi.fn() });

		expect(removeFontSize(ctx, state)).toBe(false);
	});

	it('removes stored marks for collapsed selection with fontSize', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1', {
				marks: [{ type: 'fontSize', attrs: { size: '24px' } }],
			})
			.cursor('b1', 2)
			.schema(['paragraph'], ['fontSize'])
			.build();

		const dispatch = vi.fn();
		const ctx = mockPluginContext({ getState: () => state, dispatch });

		const result: boolean = removeFontSize(ctx, state);

		expect(result).toBe(true);
		expect(dispatch).toHaveBeenCalledOnce();
	});

	it('returns false for node selection', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.nodeSelection('b1')
			.schema(['paragraph'], ['fontSize'])
			.build();

		const ctx = mockPluginContext({ getState: () => state, dispatch: vi.fn() });

		expect(removeFontSize(ctx, state)).toBe(false);
	});
});

// --- Step / Preset Navigation ---

describe('getNextPresetSize', () => {
	const sizes: readonly number[] = [8, 10, 12, 16, 24, 32, 48];

	it('returns next larger size for "up"', () => {
		expect(getNextPresetSize(12, 'up', sizes)).toBe(16);
	});

	it('returns next smaller size for "down"', () => {
		expect(getNextPresetSize(24, 'down', sizes)).toBe(16);
	});

	it('returns null when at max and stepping up', () => {
		expect(getNextPresetSize(48, 'up', sizes)).toBeNull();
	});

	it('returns null when at min and stepping down', () => {
		expect(getNextPresetSize(8, 'down', sizes)).toBeNull();
	});

	it('returns first size larger than a value between presets', () => {
		expect(getNextPresetSize(14, 'up', sizes)).toBe(16);
	});

	it('returns first size smaller than a value between presets', () => {
		expect(getNextPresetSize(14, 'down', sizes)).toBe(12);
	});

	it('returns null for empty sizes array', () => {
		expect(getNextPresetSize(16, 'up', [])).toBeNull();
		expect(getNextPresetSize(16, 'down', [])).toBeNull();
	});
});

describe('stepFontSize', () => {
	const sizes: readonly number[] = [10, 16, 24, 48];

	it('steps up from default to next preset', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
			.schema(['paragraph'], ['fontSize'])
			.build();

		const dispatch = vi.fn();
		const ctx = mockPluginContext({ getState: () => state, dispatch });

		const result: boolean = stepFontSize(ctx, state, 'up', sizes, 16);

		expect(result).toBe(true);
		expect(dispatch).toHaveBeenCalledOnce();

		const tr = dispatch.mock.calls[0]?.[0];
		const addMarkStep = tr.steps.find((s: { type: string }) => s.type === 'addMark');
		expect(addMarkStep.mark.attrs.size).toBe('24px');
	});

	it('removes mark when stepping to defaultSize', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1', {
				marks: [{ type: 'fontSize', attrs: { size: '24px' } }],
			})
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
			.schema(['paragraph'], ['fontSize'])
			.build();

		const dispatch = vi.fn();
		const ctx = mockPluginContext({ getState: () => state, dispatch });

		const result: boolean = stepFontSize(ctx, state, 'down', sizes, 16);

		expect(result).toBe(true);
		expect(dispatch).toHaveBeenCalledOnce();

		const tr = dispatch.mock.calls[0]?.[0];
		const hasAddMark: boolean = tr.steps.some((s: { type: string }) => s.type === 'addMark');
		expect(hasAddMark).toBe(false);
	});

	it('returns false when at boundary', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1', {
				marks: [{ type: 'fontSize', attrs: { size: '48px' } }],
			})
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
			.schema(['paragraph'], ['fontSize'])
			.build();

		const ctx = mockPluginContext({ getState: () => state, dispatch: vi.fn() });

		expect(stepFontSize(ctx, state, 'up', sizes, 16)).toBe(false);
	});
});

// --- Node-aware font size (formula nodes) ---

describe('node-aware font size on a display formula (NodeSelection)', () => {
	it('getActiveSize reads the block fontSize attr', () => {
		const state = displayFormulaState({ mathml: '<math></math>', fontSize: '48px' });
		expect(getActiveSize(state)).toBe('48px');
	});

	it('getActiveSizeNumeric parses the block fontSize attr', () => {
		const state = displayFormulaState({ mathml: '<math></math>', fontSize: '48px' });
		expect(getActiveSizeNumeric(state, 16)).toBe(48);
	});

	it('isFontSizeActive is true when set, false when empty', () => {
		expect(isFontSizeActive(displayFormulaState({ fontSize: '48px' }))).toBe(true);
		expect(isFontSizeActive(displayFormulaState({ fontSize: '' }))).toBe(false);
	});

	it('applyFontSize sets the block fontSize attr (preserving other attrs)', () => {
		const state = displayFormulaState({ mathml: '<math></math>', fontSize: '' });
		const dispatch = vi.fn();
		const ctx = mockPluginContext({ getState: () => state, dispatch });

		expect(applyFontSize(ctx, state, '48px')).toBe(true);
		const tr = dispatch.mock.calls[0]?.[0];
		const step = tr.steps.find((s: { type: string }) => s.type === 'setNodeAttr');
		expect(step).toBeDefined();
		expect(step.attrs.fontSize).toBe('48px');
		expect(step.attrs.mathml).toBe('<math></math>');
	});

	it('removeFontSize clears the block fontSize attr', () => {
		const state = displayFormulaState({ mathml: '<math></math>', fontSize: '48px' });
		const dispatch = vi.fn();
		const ctx = mockPluginContext({ getState: () => state, dispatch });

		expect(removeFontSize(ctx, state)).toBe(true);
		const tr = dispatch.mock.calls[0]?.[0];
		const step = tr.steps.find((s: { type: string }) => s.type === 'setNodeAttr');
		expect(step.attrs.fontSize).toBe('');
		expect(step.attrs.mathml).toBe('<math></math>');
	});
});

describe('node-aware font size on an inline formula (single-node selection)', () => {
	it('getActiveSize reads the inline node fontSize attr', () => {
		const state = inlineFormulaState({ mathml: '<math></math>', fontSize: '24px' });
		expect(getActiveSize(state)).toBe('24px');
	});

	it('applyFontSize sets the inline node fontSize attr (preserving other attrs)', () => {
		const state = inlineFormulaState({ mathml: '<math></math>', fontSize: '' });
		const dispatch = vi.fn();
		const ctx = mockPluginContext({ getState: () => state, dispatch });

		expect(applyFontSize(ctx, state, '24px')).toBe(true);
		const tr = dispatch.mock.calls[0]?.[0];
		const step = tr.steps.find((s: { type: string }) => s.type === 'setInlineNodeAttr');
		expect(step).toBeDefined();
		expect(step.attrs.fontSize).toBe('24px');
		expect(step.attrs.mathml).toBe('<math></math>');
	});
});

describe('node-aware font size does not leak to nodes that do not opt in', () => {
	it('applyFontSize returns false on a NodeSelection over a non-opt-in block', () => {
		// A plain paragraph node selection: paragraph does not declare a fontSize attr.
		const block = createBlockNode(nodeType('paragraph'), [], blockId('p1'));
		const state = EditorState.create({
			doc: createDocument([block]),
			selection: createNodeSelection(blockId('p1'), []),
			schema: FORMULA_SCHEMA,
		});
		const ctx = mockPluginContext({ getState: () => state, dispatch: vi.fn() });
		expect(applyFontSize(ctx, state, '48px')).toBe(false);
		expect(getActiveSize(state)).toBeNull();
	});
});

describe('selectSize', () => {
	it('calls executeCommand removeFontSize when size equals default', () => {
		const executeCommand = vi.fn(() => true);
		const ctx = mockPluginContext({ executeCommand } as never);

		selectSize(ctx, 16, 16);

		expect(executeCommand).toHaveBeenCalledWith('removeFontSize');
	});

	it('applies font size when size differs from default', () => {
		const state = stateBuilder()
			.paragraph('hello', 'b1')
			.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
			.schema(['paragraph'], ['fontSize'])
			.build();

		const dispatch = vi.fn();
		const ctx = mockPluginContext({ getState: () => state, dispatch });

		selectSize(ctx, 24, 16);

		expect(dispatch).toHaveBeenCalledOnce();
		const tr = dispatch.mock.calls[0]?.[0];
		const addMarkStep = tr.steps.find((s: { type: string }) => s.type === 'addMark');
		expect(addMarkStep.mark.attrs.size).toBe('24px');
	});
});
