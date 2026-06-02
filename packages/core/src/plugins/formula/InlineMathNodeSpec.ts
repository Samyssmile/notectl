/**
 * Inline math node spec: an atomic, contenteditable=false InlineNode that
 * renders native `<math>`. The native MathML is the accessibility surface
 * (screen readers consume it directly); `alttext` provides a fallback label.
 */

import type { InlineNode } from '../../model/Document.js';
import type { InlineNodeSpec } from '../../model/InlineNodeSpec.js';
import {
	mathMarkup,
	readFormulaAttrs,
	renderFormulaInto,
	setFormulaFontSize,
} from './FormulaRendering.js';
import { INLINE_MATH_TYPE } from './FormulaTypes.js';
import { extractTexAnnotation } from './mathml/MathMLDocument.js';
import { MATHML_ATTRS, MATHML_TAGS } from './mathml/MathMLSanitize.js';

/** Builds the inline math `InlineNodeSpec`. */
export function createInlineMathNodeSpec(): InlineNodeSpec<typeof INLINE_MATH_TYPE> {
	return {
		type: INLINE_MATH_TYPE,
		attrs: {
			mathml: { default: '' },
			latex: { default: '' },
			alt: { default: '' },
			fontSize: { default: '' },
		},
		toDOM(node: InlineNode): HTMLElement {
			const span: HTMLSpanElement = document.createElement('span');
			span.className = 'notectl-math notectl-math--inline';
			span.setAttribute('contenteditable', 'false');
			span.setAttribute('data-inline-type', INLINE_MATH_TYPE);
			renderFormulaInto(span, readFormulaAttrs(node.attrs));
			setFormulaFontSize(span, node.attrs);
			return span;
		},
		toHTMLString(node: InlineNode): string {
			return mathMarkup(readFormulaAttrs(node.attrs));
		},
		parseHTML: [
			{
				tag: 'math',
				getAttrs(el: HTMLElement): Record<string, unknown> | false {
					// Block display is claimed by the display-math node spec.
					if (el.getAttribute('display') === 'block') return false;
					const mathml: string = el.outerHTML;
					return {
						mathml,
						latex: extractTexAnnotation(mathml) ?? '',
						alt: el.getAttribute('alttext') ?? '',
					};
				},
			},
		],
		sanitize: { tags: [...MATHML_TAGS], attrs: [...MATHML_ATTRS] },
	};
}
