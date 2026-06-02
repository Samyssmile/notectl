import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument } from '../../model/Document.js';
import type { BlockNode } from '../../model/Document.js';
import { blockId, nodeType } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import { createDisplayMathNodeViewFactory } from './DisplayMathNodeView.js';

function displayBlock(): BlockNode {
	return createBlockNode(nodeType('math_display'), [], blockId('m1'), {
		mathml: '<math display="block"><mi>x</mi></math>',
		latex: 'x',
		alt: '',
		fontSize: '',
	});
}

function makeView(onEdit = vi.fn(), onSelect = vi.fn()) {
	const block = displayBlock();
	const state = EditorState.create({ doc: createDocument([block]) });
	const view = createDisplayMathNodeViewFactory({ onEdit, onSelect })(
		block,
		() => state,
		() => {},
	);
	return { view, onEdit, onSelect };
}

describe('createDisplayMathNodeViewFactory', () => {
	it('renders the formula as native MathML in a selectable void block', () => {
		const { view } = makeView();
		expect(view.dom.classList.contains('notectl-math--display')).toBe(true);
		expect(view.dom.getAttribute('data-void')).toBe('true');
		expect(view.dom.querySelector('math')).not.toBeNull();
	});

	it('announces only on the transition into selection (no spam on re-assert)', () => {
		const { view, onSelect } = makeView();
		view.selectNode?.();
		view.selectNode?.(); // reconcile re-asserts selection on the same node
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(view.dom.classList.contains('notectl-math--selected')).toBe(true);
	});

	it('re-announces after a deselect/reselect cycle', () => {
		const { view, onSelect } = makeView();
		view.selectNode?.();
		view.deselectNode?.();
		expect(view.dom.classList.contains('notectl-math--selected')).toBe(false);
		view.selectNode?.();
		expect(onSelect).toHaveBeenCalledTimes(2);
	});

	it('opens the editor on double-click', () => {
		const { view, onEdit } = makeView();
		view.dom.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
		expect(onEdit).toHaveBeenCalledTimes(1);
	});
});
