/**
 * Paste interceptor for incoming MathML.
 *
 * Reads the RAW `text/html` (before the editor's own DOMPurify pass), extracts a
 * standalone `<math>` (native, KaTeX, or MathJax), sanitizes it against the
 * MathML allowlist, reads any embedded LaTeX (`<annotation
 * encoding="application/x-tex">`), and inserts it as a formula node.
 *
 * KaTeX/MathJax wrap the `<math>` in an `aria-hidden` visual layer alongside a
 * `katex-mathml`/assistive copy; we treat the paste as a standalone formula when,
 * after removing the `<math>` and any `aria-hidden` subtrees, only whitespace
 * remains. Genuinely mixed rich content falls through to the default pipeline.
 *
 * Note: the editor only runs paste interceptors when `text/plain` is also
 * present (which real math sources always provide).
 */

import DOMPurify from 'dompurify';
import type { PasteInterceptor } from '../../model/PasteInterceptor.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { buildInsertDisplayMathTr, buildInsertInlineMathTr } from './FormulaCommands.js';
import type { FormulaAttrs } from './FormulaTypes.js';
import { extractTexAnnotation, isDisplayMath } from './mathml/MathMLDocument.js';
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
 * True when the HTML is essentially a single formula: it contains `<math>`, and
 * once the `<math>` and any `aria-hidden` (visual-only) subtrees are removed,
 * nothing but whitespace is left. Exported for unit testing.
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

/** Sanitizes a raw `<math>` fragment; returns null if nothing survives. */
function sanitizeMath(source: string): string | null {
	const clean: string = DOMPurify.sanitize(source, {
		ALLOWED_TAGS: [...MATHML_TAGS],
		ALLOWED_ATTR: [...MATHML_ATTRS],
	});
	return /<math[\s>]/i.test(clean) ? clean : null;
}

/** Creates the MathML paste interceptor. */
export function createFormulaPasteInterceptor(): PasteInterceptor {
	return (_plainText: string, html: string, state: EditorState): Transaction | null => {
		if (!isStandaloneMathHtml(html)) return null;
		const math: Element | null = parseFragment(html).querySelector('math');
		if (!math) return null;
		const mathml: string | null = sanitizeMath(math.outerHTML);
		if (!mathml) return null;

		const latex: string = extractTexAnnotation(mathml) ?? '';
		const attrs: FormulaAttrs = { mathml, latex, alt: '', fontSize: '' };
		return isDisplayMath(mathml)
			? buildInsertDisplayMathTr(state, attrs)
			: buildInsertInlineMathTr(state, attrs);
	};
}
