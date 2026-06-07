/**
 * Paste interceptor for incoming MathML.
 *
 * Reads the RAW `text/html` (before the editor's own DOMPurify pass), extracts
 * every standalone `<math>` (native, KaTeX, or MathJax), sanitizes each against
 * the MathML allowlist, reads any embedded LaTeX (`<annotation
 * encoding="application/x-tex">`), and inserts them as formula nodes.
 *
 * KaTeX/MathJax wrap the `<math>` in an `aria-hidden` visual layer alongside a
 * `katex-mathml`/assistive copy; we treat the paste as standalone formulas when,
 * after removing the `<math>` and any `aria-hidden` subtrees, only whitespace
 * remains. Two or more adjacent formulas qualify too, and all are inserted rather
 * than just the first (#159). Reading the canonical `<math>` from outside the
 * `aria-hidden` subtrees also dedups MathJax's assistive copy. Genuinely mixed
 * rich content falls through to the default pipeline.
 *
 * Note: the editor only runs paste interceptors when `text/plain` is also
 * present (which real math sources always provide).
 */

import DOMPurify from 'dompurify';
import type { PasteInterceptor } from '../../model/PasteInterceptor.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { buildInsertDisplayFormulasTr, buildInsertInlineFormulasTr } from './FormulaCommands.js';
import { readFormulaFontSize } from './FormulaSerialization.js';
import type { FormulaAttrs } from './FormulaTypes.js';
import { extractTexAnnotation, isDisplayMath, stripMathsize } from './mathml/MathMLDocument.js';
import { MATHML_ATTRS, MATHML_TAGS } from './mathml/MathMLSanitize.js';

/**
 * Parses untrusted clipboard HTML into an INERT fragment. A `<template>`'s content
 * lives in a document with no browsing context, so parsing it triggers no resource
 * loads and fires no `onerror`/`onload` handlers, unlike assigning `innerHTML` on a
 * live `<div>`. This matches the parse path the core uses everywhere
 * (`DocumentParser`, `PasteHTMLHandler`) and runs on the RAW, pre-sanitization HTML.
 */
function parseFragment(html: string): DocumentFragment {
	const template: HTMLTemplateElement = document.createElement('template');
	template.innerHTML = html;
	return template.content;
}

/**
 * True when the HTML is essentially nothing but formulas: it contains at least
 * one `<math>`, and once the `<math>` and any `aria-hidden` (visual-only)
 * subtrees are removed, nothing but whitespace is left. Holds for one formula or
 * for several separated only by whitespace (#159). Exported for unit testing.
 */
export function isStandaloneMathHtml(html: string): boolean {
	if (!html) return false;
	const host: DocumentFragment = parseFragment(html);
	if (!host.querySelector('math')) return false;
	const clone: DocumentFragment = host.cloneNode(true) as DocumentFragment;
	for (const el of Array.from(clone.querySelectorAll('math, [aria-hidden="true"]'))) {
		el.remove();
	}
	return (clone.textContent ?? '').trim() === '';
}

/**
 * Collects the canonical `<math>` elements of a standalone paste in document
 * order, excluding any inside an `aria-hidden="true"` subtree. KaTeX and MathJax
 * each emit a hidden duplicate per equation (a visual layer / an assistive
 * `<math>` copy); dropping those subtrees first counts every formula exactly
 * once, so the interceptor never double-inserts. Exported for unit testing.
 */
export function collectStandaloneMathElements(html: string): Element[] {
	if (!html) return [];
	const host: DocumentFragment = parseFragment(html);
	for (const hidden of Array.from(host.querySelectorAll('[aria-hidden="true"]'))) {
		hidden.remove();
	}
	return Array.from(host.querySelectorAll('math'));
}

/** Sanitizes a raw `<math>` fragment; returns null if nothing survives. */
function sanitizeMath(source: string): string | null {
	const clean: string = DOMPurify.sanitize(source, {
		ALLOWED_TAGS: [...MATHML_TAGS],
		ALLOWED_ATTR: [...MATHML_ATTRS],
	});
	return /<math[\s>]/i.test(clean) ? clean : null;
}

/** Sanitizes one parsed `<math>` element into canonical formula attrs, or null. */
function toFormulaAttrs(math: Element): FormulaAttrs | null {
	const sanitized: string | null = sanitizeMath(math.outerHTML);
	if (!sanitized) return null;
	// Lift the native `mathsize` into the `fontSize` attr (single source of truth)
	// so a sized formula pasted from KaTeX/MathJax/Word keeps its size (#160).
	const mathml: string = stripMathsize(sanitized);
	return {
		mathml,
		latex: extractTexAnnotation(mathml) ?? '',
		alt: '',
		fontSize: readFormulaFontSize(math),
	};
}

/** Creates the MathML paste interceptor. */
export function createFormulaPasteInterceptor(): PasteInterceptor {
	return (_plainText: string, html: string, state: EditorState): Transaction | null => {
		if (!isStandaloneMathHtml(html)) return null;

		const formulas: FormulaAttrs[] = collectStandaloneMathElements(html)
			.map(toFormulaAttrs)
			.filter((attrs: FormulaAttrs | null): attrs is FormulaAttrs => attrs !== null);
		if (formulas.length === 0) return null;

		// Inline formulas join the text flow; a run that contains any display
		// formula is laid out as blocks (the safe context for display math).
		const allInline: boolean = formulas.every((attrs) => !isDisplayMath(attrs.mathml));
		return allInline
			? buildInsertInlineFormulasTr(state, formulas)
			: buildInsertDisplayFormulasTr(state, formulas);
	};
}
