/**
 * Pure functions for reading and writing editor content in various formats.
 *
 * Extracted from NotectlEditor to keep the Web Component shell thin.
 * Every function is stateless — it receives EditorState / Document and returns data.
 */

import { type Document, getBlockText } from '../model/Document.js';
import { formatHTML } from '../model/HTMLUtils.js';
import { schemaFromRegistry } from '../model/Schema.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { blockId } from '../model/TypeBrands.js';
import type {
	ContentCSSResult,
	ContentHTMLOptions,
	SetContentHTMLOptions,
} from '../serialization/ContentHTMLTypes.js';
import { EditorState } from '../state/EditorState.js';

/** Returns the document as JSON from the given state. */
export function getEditorJSON(state: EditorState): Document {
	return state.doc;
}

/** Replaces editor state from a JSON document. */
export function setEditorJSON(
	doc: Document,
	registry: SchemaRegistry | undefined,
	replaceState: (state: EditorState) => void,
): void {
	const schema = registry ? schemaFromRegistry(registry) : undefined;
	const state: EditorState = EditorState.create({
		doc,
		schema,
		selection: createCollapsedSelection(doc.children[0]?.id ?? blockId(''), 0),
	});
	replaceState(state);
}

/** Returns sanitized HTML representation of the document. */
export async function getEditorContentHTML(
	state: EditorState,
	registry: SchemaRegistry | undefined,
	options?: ContentHTMLOptions,
): Promise<string | ContentCSSResult> {
	const doc: Document = state.doc;

	const { serializeDocumentToHTML, serializeDocumentToCSS } = await import(
		'../serialization/DocumentSerializer.js'
	);

	if (options?.cssMode === 'classes') {
		const result: ContentCSSResult = serializeDocumentToCSS(doc, registry);
		return options.pretty
			? { html: formatHTML(result.html), css: result.css, styleMap: result.styleMap }
			: result;
	}

	const html: string = serializeDocumentToHTML(doc, registry);
	return options?.pretty ? formatHTML(html) : html;
}

/** Sets content from HTML (sanitized). Accepts optional `styleMap` for class-based round-trip. */
export async function setEditorContentHTML(
	html: string,
	registry: SchemaRegistry | undefined,
	replaceState: (state: EditorState) => void,
	options?: SetContentHTMLOptions,
): Promise<void> {
	const { parseHTMLToDocument } = await import('../serialization/DocumentParser.js');
	const doc: Document = parseHTMLToDocument(html, registry, options);
	setEditorJSON(doc, registry, replaceState);
}

/** Returns plain text content. */
export function getEditorText(state: EditorState): string {
	return state.doc.children.map((b) => getBlockText(b)).join('\n');
}

/** Returns true if the document is empty (zero blocks, or a single empty paragraph). */
export function isEditorEmpty(doc: Document | undefined): boolean {
	if (!doc) return true;
	if (doc.children.length === 0) return true;
	if (doc.children.length > 1) return false;
	const block = doc.children[0];
	if (!block) return true;
	return block.type === 'paragraph' && getBlockText(block) === '';
}
