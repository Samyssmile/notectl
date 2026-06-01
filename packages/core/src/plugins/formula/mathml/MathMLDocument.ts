/**
 * Canonical `<math>` document contract for the formula plugin.
 *
 * Layer A (framework-agnostic, zero notectl imports). The canonical stored form
 * of a formula is a complete `<math>` string carrying its LaTeX source as a TeX
 * annotation, so it is self-contained, screen-reader-ready, directly
 * serializable to HTML, and round-trips losslessly for re-editing (D-3).
 *
 *   <math display="inline|block">
 *     <semantics>
 *       {presentation}
 *       <annotation encoding="application/x-tex">{latex}</annotation>
 *     </semantics>
 *   </math>
 *
 * When no LaTeX source is available the `<semantics>`/`<annotation>` wrapper is
 * omitted and the presentation MathML is the direct child of `<math>`.
 */

import { escapeAttr, escapeText } from './MathMLBuilder.js';

/** The MathML namespace URI. */
export const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

/** Encoding used for the embedded LaTeX annotation (KaTeX/MathJax convention). */
export const TEX_ANNOTATION_ENCODING = 'application/x-tex';

/** Parts that compose a canonical `<math>` document. */
export interface MathMLDocumentParts {
	/** Presentation MathML: a single root element (e.g. `<mrow>…</mrow>`). */
	readonly presentation: string;
	/** Whether this is display (block) or inline math. */
	readonly display: boolean;
	/** LaTeX source; stored as a TeX annotation for lossless re-editing. */
	readonly latex?: string;
	/** Human-readable fallback label, rendered as the native `alttext`. */
	readonly alt?: string;
}

const ENTITY_UNESCAPES: Readonly<Record<string, string>> = {
	'&amp;': '&',
	'&lt;': '<',
	'&gt;': '>',
	'&quot;': '"',
	'&apos;': "'",
	'&#39;': "'",
};

function unescapeEntities(text: string): string {
	return text.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (m) => ENTITY_UNESCAPES[m] ?? m);
}

/** Assembles the canonical `<math>` string from its parts. */
export function buildMathML(parts: MathMLDocumentParts): string {
	const display: string = parts.display ? 'block' : 'inline';
	const altAttr: string = parts.alt ? ` alttext="${escapeAttr(parts.alt)}"` : '';
	const hasLatex: boolean = parts.latex !== undefined && parts.latex !== '';
	const tex: string = escapeText(parts.latex ?? '');
	const annotation = `<annotation encoding="${TEX_ANNOTATION_ENCODING}">${tex}</annotation>`;
	const body: string = hasLatex
		? `<semantics>${parts.presentation}${annotation}</semantics>`
		: parts.presentation;
	return `<math display="${display}"${altAttr}>${body}</math>`;
}

/** Reads the embedded LaTeX source from a `<math>` string, if present. */
export function extractTexAnnotation(mathml: string): string | undefined {
	const match: RegExpMatchArray | null = mathml.match(
		/<annotation\b[^>]*\bencoding=["']application\/x-tex["'][^>]*>([\s\S]*?)<\/annotation>/i,
	);
	if (!match || match[1] === undefined) return undefined;
	return unescapeEntities(match[1]).trim();
}

/** Returns true when the `<math>` root declares `display="block"`. */
export function isDisplayMath(mathml: string): boolean {
	return /<math\b[^>]*\bdisplay=["']block["']/i.test(mathml);
}

/** Returns the first complete `<math>…</math>` fragment in an HTML string. */
export function findMathElement(html: string): string | undefined {
	return findAllMathElements(html)[0];
}

/** Returns every complete `<math>…</math>` fragment in an HTML string, in order. */
export function findAllMathElements(html: string): string[] {
	const matches: RegExpMatchArray[] = [...html.matchAll(/<math\b[^>]*>[\s\S]*?<\/math>/gi)];
	return matches.map((m) => m[0]);
}

/** Returns the canonical `<math>` with its `alttext` set to the given label. */
export function withAlttext(mathml: string, alt: string): string {
	const stripped: string = mathml.replace(/^(<math\b[^>]*?)\s+alttext=["'][^"']*["']/i, '$1');
	if (!alt) return stripped;
	return stripped.replace(/^<math\b/i, `<math alttext="${escapeAttr(alt)}"`);
}
