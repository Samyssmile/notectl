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
 * Shared mark-serialization core. Style-based marks (`toHTMLStyle`) are merged
 * and wrapped via `wrapStyleSpan`; tag-based marks (`toHTMLString`) then wrap
 * the result in rank order. The two public entry points differ only in how the
 * merged style declarations become a `<span>`.
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

	let html: string = escapeHTML(text);

	if (marks.length === 0) return html;

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

	// Wrap with the merged style span first (closest to text).
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
	return serializeMarks(text, marks, registry, markOrder, exportCtx, (html, declarations) => {
		const attr: string = exportCtx ? exportCtx.styleAttr(declarations) : ` style="${declarations}"`;
		return attr ? `<span${attr}>${html}</span>` : html;
	});
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
	return serializeMarks(
		text,
		marks,
		registry,
		markOrder,
		exportCtx,
		(html, declarations) => `<span class="${collector.getClassName(declarations)}">${html}</span>`,
	);
}
