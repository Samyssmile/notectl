/**
 * MarkSerializer: shared mark serialization logic for DocumentSerializer and ClipboardHandler.
 * Separates style-based marks (merged into a single `<span style>`) from tag-based marks
 * (nested wrappers in rank order).
 */

import type { Mark } from '../model/Document.js';
import { escapeHTML } from '../model/HTMLUtils.js';
import type { MarkSpec } from '../model/MarkSpec.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';

/** Builds a map of mark type name to rank from the registry (compute once per pass). */
export function buildMarkOrder(registry: SchemaRegistry): Map<string, number> {
	const types: readonly string[] = registry.getMarkTypes();
	const order = new Map<string, number>();
	for (const t of types) {
		const spec: MarkSpec | undefined = registry.getMarkSpec(t);
		if (spec) order.set(t, spec.rank ?? 99);
	}
	return order;
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
): string {
	if (text === '') return '';

	let html: string = escapeHTML(text);

	if (marks.length === 0) return html;

	const order: Map<string, number> = markOrder ?? buildMarkOrder(registry);
	const sortedMarks: Mark[] = [...marks].sort(
		(a, b) => (order.get(a.type) ?? 99) - (order.get(b.type) ?? 99),
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

	// Wrap with merged style span first (closest to text)
	if (styleParts.length > 0) {
		html = `<span style="${styleParts.join('; ')}">${html}</span>`;
	}

	// Then wrap with tag-based marks in rank order
	for (const mark of tagMarks) {
		const markSpec: MarkSpec | undefined = registry.getMarkSpec(mark.type);
		if (markSpec?.toHTMLString) {
			html = markSpec.toHTMLString(mark, html);
		}
	}

	return html;
}
