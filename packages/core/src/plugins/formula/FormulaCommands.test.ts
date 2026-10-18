import { describe, expect, it, vi } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getBlockText,
	getInlineChildren,
	isInlineNode,
} from '../../model/Document.js';
import {
	createCollapsedSelection,
	createGapCursor,
	createNodeSelection,
	createSelection,
	isNodeSelection,
} from '../../model/Selection.js';
import { blockId, inlineType, nodeType } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import { invertTransaction } from '../../state/StepHandlers.js';
import { mockPluginContext } from '../../test/TestUtils.js';
import {
	buildInsertDisplayFormulasTr,
	buildInsertInlineFormulasTr,
	updateDisplayMath,
	updateInlineMath,
} from './FormulaCommands.js';
import { DISPLAY_MATH_TYPE, type FormulaAttrs, INLINE_MATH_TYPE } from './FormulaTypes.js';

interface AttrStep {
	readonly type: string;
	readonly attrs: Record<string, string>;
}

function formulaAttrs(latex: string, display = false): FormulaAttrs {
	const displayAttr: string = display ? 'block' : 'inline';
	return {
		mathml: `<math display="${displayAttr}"><mi>${latex}</mi></math>`,
		latex,
		alt: '',
		fontSize: '',
	};
}

function emptyParagraphState(): EditorState {
	const block = createBlockNode(nodeType('paragraph'), [createTextNode('')], blockId('b1'));
	return EditorState.create({
		doc: createDocument([block]),
		selection: createCollapsedSelection(blockId('b1'), 0),
	});
}

/** Three paragraphs with a backward range from `cc|cc` to `aa|aa`. */
function backwardRangeState(): EditorState {
	const paragraph = (text: string, id: string) =>
		createBlockNode(nodeType('paragraph'), [createTextNode(text)], blockId(id));
	return EditorState.create({
		doc: createDocument([
			paragraph('aaaa', 'b1'),
			paragraph('bbbb', 'b2'),
			paragraph('cccc', 'b3'),
		]),
		selection: createSelection(
			{ blockId: blockId('b3'), offset: 2 },
			{ blockId: blockId('b1'), offset: 2 },
		),
	});
}

const summarize = (state: EditorState): string[] =>
	state.doc.children.map((block) => `${block.type}:${getBlockText(block)}`);

// The editor's size control round-trips the current fontSize (initialFontSize →
// control → result.fontSize), so the update commands carry it through verbatim.

describe('updateInlineMath', () => {
	it('writes mathml/latex/alt and the chosen fontSize onto the inline node', () => {
		const inline = createInlineNode(inlineType('math_inline'), {
			mathml: '<math>old</math>',
			latex: 'a',
			alt: '',
			fontSize: '32px',
		});
		const block = createBlockNode(nodeType('paragraph'), [inline], blockId('b1'));
		const state = EditorState.create({
			doc: createDocument([block]),
			selection: createCollapsedSelection(blockId('b1'), 1),
		});
		const dispatch = vi.fn();
		const ctx = mockPluginContext({ getState: () => state, dispatch });

		updateInlineMath(ctx, blockId('b1'), 0, {
			mathml: '<math>new</math>',
			latex: 'b',
			alt: '',
			fontSize: '32px',
		});

		const tr = dispatch.mock.calls[0]?.[0];
		const step = tr.steps.find((s: AttrStep) => s.type === 'setInlineNodeAttr') as AttrStep;
		expect(step.attrs.fontSize).toBe('32px');
		expect(step.attrs.mathml).toBe('<math>new</math>');
		expect(step.attrs.latex).toBe('b');
	});
});

describe('updateDisplayMath', () => {
	it('writes mathml/latex/alt and the chosen fontSize onto the display block', () => {
		const mathBlock = createBlockNode(nodeType('math_display'), [], blockId('m1'), {
			mathml: '<math>old</math>',
			latex: 'a',
			alt: '',
			fontSize: '48px',
		});
		const state = EditorState.create({
			doc: createDocument([mathBlock]),
			selection: createNodeSelection(blockId('m1'), []),
		});
		const dispatch = vi.fn();
		const ctx = mockPluginContext({ getState: () => state, dispatch });

		updateDisplayMath(ctx, [blockId('m1')], {
			mathml: '<math>new</math>',
			latex: 'b',
			alt: '',
			fontSize: '48px',
		});

		const tr = dispatch.mock.calls[0]?.[0];
		const step = tr.steps.find((s: AttrStep) => s.type === 'setNodeAttr') as AttrStep;
		expect(step.attrs.fontSize).toBe('48px');
		expect(step.attrs.mathml).toBe('<math>new</math>');
	});
});

// Multiple standalone formulas pasted at once must all be inserted, not just the
// first one (issue #159). The interceptor routes all-inline runs here and any run
// containing a display formula to buildInsertDisplayFormulasTr.
describe('buildInsertInlineFormulasTr', () => {
	it('inserts every inline formula, advancing the offset (issue #159)', () => {
		const tr = buildInsertInlineFormulasTr(emptyParagraphState(), [
			formulaAttrs('x'),
			formulaAttrs('y'),
		]);

		const inlineTypes = (tr?.steps ?? [])
			.filter((s) => s.type === 'insertInlineNode')
			.map((s) => (s.type === 'insertInlineNode' ? s.node.inlineType : undefined));
		expect(inlineTypes).toEqual([inlineType(INLINE_MATH_TYPE), inlineType(INLINE_MATH_TYPE)]);
	});

	it('preserves the single-formula behaviour for one formula', () => {
		const tr = buildInsertInlineFormulasTr(emptyParagraphState(), [formulaAttrs('x')]);
		expect((tr?.steps ?? []).filter((s) => s.type === 'insertInlineNode')).toHaveLength(1);
	});
});

describe('buildInsertDisplayFormulasTr', () => {
	it('inserts every display formula as its own block (issue #159)', () => {
		const tr = buildInsertDisplayFormulasTr(emptyParagraphState(), [
			formulaAttrs('x', true),
			formulaAttrs('y', true),
		]);

		const blockSteps = (tr?.steps ?? []).filter(
			(s) => s.type === 'insertNode' && s.node.type === nodeType(DISPLAY_MATH_TYPE),
		);
		expect(blockSteps).toHaveLength(2);
	});

	it('replaces a backward range and places the formula after the receiving block', () => {
		const state: EditorState = backwardRangeState();

		const tr = buildInsertDisplayFormulasTr(state, [formulaAttrs('x', true)]);
		if (!tr) throw new Error('Expected a transaction');
		const result: EditorState = state.apply(tr);

		expect(summarize(result)).toEqual(['paragraph:aacc', `${DISPLAY_MATH_TYPE}:`, 'paragraph:']);
		const sel = result.selection;
		expect(isNodeSelection(sel) && result.getBlock(sel.nodeId)?.type).toBe(DISPLAY_MATH_TYPE);
		expect(result.apply(invertTransaction(tr)).doc).toEqual(state.doc);
	});

	it('inserts nothing at a gap cursor', () => {
		const math = createBlockNode(nodeType(DISPLAY_MATH_TYPE), [], blockId('m1'));
		const state = EditorState.create({
			doc: createDocument([math]),
			selection: createGapCursor(blockId('m1'), 'before', []),
		});

		expect(buildInsertDisplayFormulasTr(state, [formulaAttrs('x', true)])).toBeNull();
	});
});

describe('buildInsertInlineFormulasTr with a range', () => {
	it('replaces a backward range at its start', () => {
		const state: EditorState = backwardRangeState();

		const tr = buildInsertInlineFormulasTr(state, [formulaAttrs('x')]);
		if (!tr) throw new Error('Expected a transaction');
		const result: EditorState = state.apply(tr);

		const merged = result.doc.children[0];
		expect(result.doc.children).toHaveLength(1);
		expect(
			getInlineChildren(merged ?? createBlockNode(nodeType('paragraph'))).map((child) =>
				isInlineNode(child) ? child.inlineType : child.text,
			),
		).toEqual(['aa', INLINE_MATH_TYPE, 'cc']);
	});
});
