/**
 * MarkSerializer: shared mark serialization logic for DocumentSerializer and ClipboardHandler.
 * Separates style-based marks (merged into a single `<span style>`) from tag-based marks
 * (nested wrappers in rank order).
 */

import type { Mark } from '../model/Document.js';
import { escapeHTML } from '../model/HTMLUtils.js';
import type { MarkSpec } from '../model/MarkSpec.js';
import type { HTMLExportContext } from '../model/NodeSpec.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { CSSClassCollector } from './CSSClassCollector.js';

/** Rank assigned to marks whose spec does not declare an explicit `rank`. */
const DEFAULT_MARK_RANK = 99;

/** Builds a map of mark type name to rank from the registry (compute once per pass). */
export function buildMarkOrder(registry: SchemaRegistry): Map<string, number> {
	const types: readonly string[] = registry.getMarkTypes();
	const order = new Map<string, number>();
	for (const t of types) {
		const spec: MarkSpec | undefined = registry.getMarkSpec(t);
		if (spec) order.set(t, spec.rank ?? DEFAULT_MARK_RANK);
	}
	return order;
}

/**
 * Wraps already-rendered inner HTML in its marks. Style-based marks
 * (`toHTMLStyle`) are merged into a single span via `wrapStyleSpan`; tag-based
 * marks (`toHTMLString`) then wrap the result in rank order. The inner HTML is
 * emitted verbatim (callers pre-escape text; rendered inline-node HTML must not
 * be re-escaped).
 */
function wrapMarks(
	innerHTML: string,
	marks: readonly Mark[],
	registry: SchemaRegistry,
	markOrder: Map<string, number> | undefined,
	exportCtx: HTMLExportContext | undefined,
	wrapStyleSpan: (html: string, declarations: string) => string,
): string {
	if (marks.length === 0) return innerHTML;

	const order: Map<string, number> = markOrder ?? buildMarkOrder(registry);
	const sortedMarks: Mark[] = [...marks].sort(
		(a, b) => (order.get(a.type) ?? DEFAULT_MARK_RANK) - (order.get(b.type) ?? DEFAULT_MARK_RANK),
	);

	const styleParts: string[] = [];
	const tagMarks: Mark[] = [];

	for (const mark of sortedMarks) {
		const markSpec: MarkSpec | undefined = registry.getMarkSpec(mark.type);
		if (markSpec?.toHTMLStyle) {
			const style: string | null = markSpec.toHTMLStyle(mark);
			if (style) {
				styleParts.push(style);
			}
		} else {
			tagMarks.push(mark);
		}
	}

	// Wrap with the merged style span first (closest to content).
	let html: string = innerHTML;
	if (styleParts.length > 0) {
		html = wrapStyleSpan(html, styleParts.join('; '));
	}

	// Then wrap with tag-based marks in rank order.
	for (const mark of tagMarks) {
		const markSpec: MarkSpec | undefined = registry.getMarkSpec(mark.type);
		if (markSpec?.toHTMLString) {
			html = markSpec.toHTMLString(mark, html, exportCtx);
		}
	}

	return html;
}

/**
 * Shared text mark-serialization core: escapes `text`, then delegates to
 * {@link wrapMarks}. The two public entry points differ only in how the merged
 * style declarations become a `<span>`.
 */
function serializeMarks(
	text: string,
	marks: readonly Mark[],
	registry: SchemaRegistry,
	markOrder: Map<string, number> | undefined,
	exportCtx: HTMLExportContext | undefined,
	wrapStyleSpan: (html: string, declarations: string) => string,
): string {
	if (text === '') return '';
	return wrapMarks(escapeHTML(text), marks, registry, markOrder, exportCtx, wrapStyleSpan);
}

/** Builds the inline-style `<span style>` wrapper used by the style-attribute mode. */
function inlineStyleSpanWrapper(
	exportCtx: HTMLExportContext | undefined,
): (html: string, declarations: string) => string {
	return (html, declarations) => {
		const attr: string = exportCtx ? exportCtx.styleAttr(declarations) : ` style="${declarations}"`;
		return attr ? `<span${attr}>${html}</span>` : html;
	};
}

/** Builds the `<span class>` wrapper used by the CSS-class mode. */
function classSpanWrapper(
	collector: CSSClassCollector,
): (html: string, declarations: string) => string {
	return (html, declarations) =>
		`<span class="${collector.getClassName(declarations)}">${html}</span>`;
}

/**
 * Serializes text with marks to HTML.
 * Style-based marks (`toHTMLStyle`) are merged into a single `<span style="...">`.
 * Tag-based marks (`toHTMLString`) wrap the content in rank order.
 */
export function serializeMarksToHTML(
	text: string,
	marks: readonly Mark[],
	registry: SchemaRegistry,
	markOrder?: Map<string, number>,
	exportCtx?: HTMLExportContext,
): string {
	return serializeMarks(
		text,
		marks,
		registry,
		markOrder,
		exportCtx,
		inlineStyleSpanWrapper(exportCtx),
	);
}

/**
 * Wraps an already-rendered inline-node HTML fragment (e.g. `<img>`) in its marks
 * using inline-style spans, mirroring {@link serializeMarksToHTML} but without
 * escaping the fragment. Lets a linked inline image export as `<a …><img …></a>`.
 */
export function serializeInlineNodeMarksToHTML(
	innerHTML: string,
	marks: readonly Mark[],
	registry: SchemaRegistry,
	markOrder?: Map<string, number>,
	exportCtx?: HTMLExportContext,
): string {
	return wrapMarks(
		innerHTML,
		marks,
		registry,
		markOrder,
		exportCtx,
		inlineStyleSpanWrapper(exportCtx),
	);
}

/**
 * Serializes text with marks to HTML using CSS class names instead of inline styles.
 * Style-based marks (`toHTMLStyle`) are collected into a `CSSClassCollector` and emitted
 * as `<span class="...">`. Tag-based marks (`toHTMLString`) wrap identically to the inline path.
 */
export function serializeMarksToClassHTML(
	text: string,
	marks: readonly Mark[],
	registry: SchemaRegistry,
	collector: CSSClassCollector,
	markOrder?: Map<string, number>,
	exportCtx?: HTMLExportContext,
): string {
	return serializeMarks(text, marks, registry, markOrder, exportCtx, classSpanWrapper(collector));
}

/**
 * Wraps an already-rendered inline-node HTML fragment in its marks using
 * CSS-class spans, mirroring {@link serializeMarksToClassHTML} but without
 * escaping the fragment.
 */
export function serializeInlineNodeMarksToClassHTML(
	innerHTML: string,
	marks: readonly Mark[],
	registry: SchemaRegistry,
	collector: CSSClassCollector,
	markOrder?: Map<string, number>,
	exportCtx?: HTMLExportContext,
): string {
	return wrapMarks(innerHTML, marks, registry, markOrder, exportCtx, classSpanWrapper(collector));
}
