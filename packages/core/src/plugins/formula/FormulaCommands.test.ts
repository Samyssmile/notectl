import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createInlineNode } from '../../model/Document.js';
import { createCollapsedSelection, createNodeSelection } from '../../model/Selection.js';
import { blockId, inlineType, nodeType } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import { mockPluginContext } from '../../test/TestUtils.js';
import { updateDisplayMath, updateInlineMath } from './FormulaCommands.js';

interface AttrStep {
	readonly type: string;
	readonly attrs: Record<string, string>;
}

describe('updateInlineMath', () => {
	it('preserves the existing fontSize attr when editing latex/mathml', () => {
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

		updateInlineMath(ctx, blockId('b1'), 0, { mathml: '<math>new</math>', latex: 'b', alt: '' });

		const tr = dispatch.mock.calls[0]?.[0];
		const step = tr.steps.find((s: AttrStep) => s.type === 'setInlineNodeAttr') as AttrStep;
		expect(step.attrs.fontSize).toBe('32px');
		expect(step.attrs.mathml).toBe('<math>new</math>');
		expect(step.attrs.latex).toBe('b');
	});
});

describe('updateDisplayMath', () => {
	it('preserves the existing fontSize attr when editing', () => {
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

		updateDisplayMath(ctx, [blockId('m1')], { mathml: '<math>new</math>', latex: 'b', alt: '' });

		const tr = dispatch.mock.calls[0]?.[0];
		const step = tr.steps.find((s: AttrStep) => s.type === 'setNodeAttr') as AttrStep;
		expect(step.attrs.fontSize).toBe('48px');
		expect(step.attrs.mathml).toBe('<math>new</math>');
	});
});
