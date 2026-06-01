/**
 * Shared rendering helpers for formula nodes. Turns the stored canonical
 * `<math>` string into live DOM. Used by both the inline node spec and the
 * display-math node view, so they stay consistent.
 *
 * Setting `innerHTML` with a `<math>` string makes the HTML fragment parser
 * place it in the MathML namespace (verified in Chromium). The stored value is
 * always trusted: it is either produced by our own converter or sanitized on
 * the paste path before storage.
 */

import type { FormulaAttrs } from './FormulaTypes.js';
import { withAlttext } from './mathml/MathMLDocument.js';

const MATH_TAG_PATTERN = /<math[\s>]/i;

/** Returns the canonical `<math>` markup with its `alttext` set from `alt`. */
export function mathMarkup(attrs: FormulaAttrs): string {
	if (!MATH_TAG_PATTERN.test(attrs.mathml)) return '';
	return withAlttext(attrs.mathml, attrs.alt);
}

/**
 * Renders the formula into `host`. On malformed/empty MathML it falls back to
 * the LaTeX source (or the alt label) as plain text so a formula is never
 * silently invisible.
 */
export function renderFormulaInto(host: HTMLElement, attrs: FormulaAttrs): void {
	const markup: string = mathMarkup(attrs);
	if (markup) {
		host.innerHTML = markup;
		return;
	}
	host.textContent = attrs.latex || attrs.alt || '⊡';
}

/** Reads formula attributes from a model node's raw attrs, with safe defaults. */
export function readFormulaAttrs(
	attrs: Readonly<Record<string, unknown>> | undefined,
): FormulaAttrs {
	return {
		mathml: typeof attrs?.mathml === 'string' ? attrs.mathml : '',
		latex: typeof attrs?.latex === 'string' ? attrs.latex : '',
		alt: typeof attrs?.alt === 'string' ? attrs.alt : '',
	};
}
