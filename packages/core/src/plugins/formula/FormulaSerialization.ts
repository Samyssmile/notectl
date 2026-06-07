/**
 * HTML serialization glue shared by the inline and display math node specs, so
 * both round-trip identically (issue #160).
 *
 * A formula's font size is stored as a node `fontSize` attribute. It is written
 * to HTML as the native MathML `mathsize` attribute on the `<math>` root (the
 * idiomatic way to scale a formula) and read back from there. This makes the
 * size survive `getContentHTML()` and also captures sized math pasted from
 * external tools (KaTeX, MathJax, Word all emit `mathsize`).
 */

import { isValidCSSFontSize } from '../shared/ColorValidation.js';
import { mathMarkup } from './FormulaRendering.js';
import type { FormulaAttrs } from './FormulaTypes.js';
import {
	extractTexAnnotation,
	stripBlockIds,
	stripMathsize,
	withMathsize,
} from './mathml/MathMLDocument.js';

/**
 * The exportable `<math>` HTML for a formula, with its font size carried as the
 * native `mathsize` attribute. Returns `''` when the formula has no valid markup.
 */
export function formulaToHTMLString(attrs: FormulaAttrs): string {
	const markup: string = mathMarkup(attrs);
	if (!markup) return markup;
	return withMathsize(markup, isValidCSSFontSize(attrs.fontSize) ? attrs.fontSize : '');
}

/** The validated CSS font size carried by a `<math>` element's `mathsize`, or `''`. */
export function readFormulaFontSize(el: Element): string {
	const raw: string = el.getAttribute('mathsize') ?? '';
	return isValidCSSFontSize(raw) ? raw : '';
}

/**
 * Reads canonical formula attributes (`mathml`, `latex`, `alt`, `fontSize`) from
 * a `<math>` element. Returns `false` when the element's display kind does not
 * match `expectDisplay`, so the inline spec yields to the display spec and vice
 * versa. The `mathsize` is lifted into `fontSize` and stripped from the stored
 * `mathml` (single source of truth).
 */
export function parseFormulaElement(
	el: HTMLElement,
	expectDisplay: boolean,
): Record<string, string> | false {
	if ((el.getAttribute('display') === 'block') !== expectDisplay) return false;
	const mathml: string = stripMathsize(stripBlockIds(el.outerHTML));
	return {
		mathml,
		latex: extractTexAnnotation(mathml) ?? '',
		alt: el.getAttribute('alttext') ?? '',
		fontSize: readFormulaFontSize(el),
	};
}
