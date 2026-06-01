/**
 * NodeView for display math: renders the block, shows a selection ring when the
 * void block is node-selected (keyboard via gap-cursor, or mouse), and opens the
 * edit overlay on double-click. Mirrors the image plugin's selection pattern.
 */

import type { BlockNode } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { createBlockElement } from '../../view/DomUtils.js';
import type { NodeView, NodeViewFactory } from '../../view/NodeView.js';
import { readFormulaAttrs, renderFormulaInto, setFormulaFontSize } from './FormulaRendering.js';
import { DISPLAY_MATH_TYPE } from './FormulaTypes.js';

/** Builds a NodeView factory for display math, wiring double-click to `onEdit`. */
export function createDisplayMathNodeViewFactory(
	onEdit: (blockId: BlockId, rect: DOMRect) => void,
): NodeViewFactory {
	return (node: BlockNode): NodeView => {
		let currentId: BlockId = node.id;
		const dom: HTMLElement = createBlockElement('div', node.id);
		dom.className = 'notectl-math notectl-math--display';
		dom.setAttribute('data-void', 'true');
		dom.setAttribute('data-selectable', 'true');
		renderFormulaInto(dom, readFormulaAttrs(node.attrs));
		setFormulaFontSize(dom, node.attrs);

		dom.addEventListener('dblclick', (e: MouseEvent) => {
			e.preventDefault();
			onEdit(currentId, dom.getBoundingClientRect());
		});

		return {
			dom,
			contentDOM: null,
			update(updated: BlockNode): boolean {
				if (updated.type !== DISPLAY_MATH_TYPE) return false;
				currentId = updated.id;
				dom.setAttribute('data-block-id', updated.id);
				renderFormulaInto(dom, readFormulaAttrs(updated.attrs));
				setFormulaFontSize(dom, updated.attrs);
				return true;
			},
			selectNode(): void {
				dom.classList.add('notectl-math--selected');
			},
			deselectNode(): void {
				dom.classList.remove('notectl-math--selected');
			},
		};
	};
}
