/**
 * Display math node spec: a selectable void block rendering native `<math
 * display="block">` on its own line. Mirrors the inline spec's serialization
 * and sanitize, but as a block-level node (reference: horizontal-rule + image).
 */

import type { BlockNode } from '../../model/Document.js';
import type { NodeSpec } from '../../model/NodeSpec.js';
import { createBlockElement } from '../../view/DomUtils.js';
import { readFormulaAttrs, renderFormulaInto, setFormulaFontSize } from './FormulaRendering.js';
import { formulaToHTMLString, parseFormulaElement } from './FormulaSerialization.js';
import { DISPLAY_MATH_TYPE } from './FormulaTypes.js';
import { MATHML_ATTRS, MATHML_TAGS } from './mathml/MathMLSanitize.js';

/** Builds the display math `NodeSpec` (selectable void block). */
export function createDisplayMathNodeSpec(): NodeSpec<typeof DISPLAY_MATH_TYPE> {
	return {
		type: DISPLAY_MATH_TYPE,
		group: 'block',
		isVoid: true,
		selectable: true,
		attrs: {
			mathml: { default: '' },
			latex: { default: '' },
			alt: { default: '' },
			fontSize: { default: '' },
		},
		toDOM(node): HTMLElement {
			const host: HTMLElement = createBlockElement('div', node.id);
			host.className = 'notectl-math notectl-math--display';
			host.setAttribute('data-void', 'true');
			host.setAttribute('data-selectable', 'true');
			renderFormulaInto(host, readFormulaAttrs(node.attrs));
			setFormulaFontSize(host, node.attrs);
			return host;
		},
		toHTML(node: BlockNode): string {
			return formulaToHTMLString(readFormulaAttrs(node.attrs));
		},
		parseHTML: [
			{
				tag: 'math',
				getAttrs: (el: HTMLElement): Record<string, unknown> | false =>
					parseFormulaElement(el, true),
			},
		],
		sanitize: { tags: [...MATHML_TAGS], attrs: [...MATHML_ATTRS] },
	};
}
