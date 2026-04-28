/**
 * Pure functions for reading and writing editor content in various formats.
 *
 * Extracted from NotectlEditor to keep the Web Component shell thin.
 * Every function is stateless — it receives EditorState / Document and returns data.
 */

import type { BlockNode, ChildNode } from '../model/Document.js';
import {
	type Document,
	createBlockNode,
	createTextNode,
	getBlockText,
	isInlineNode,
	isLeafBlock,
	isTextNode,
} from '../model/Document.js';
import { formatHTML } from '../model/HTMLUtils.js';
import { schemaFromRegistry } from '../model/Schema.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { type BlockId, nodeType } from '../model/TypeBrands.js';
import { parseHTMLToDocument } from '../serialization/DocumentParser.js';
import {
	serializeDocumentToCSS,
	serializeDocumentToHTML,
} from '../serialization/DocumentSerializer.js';
import type {
	ContentCSSResult,
	ContentHTMLOptions,
	SetContentHTMLOptions,
} from '../serialization/index.js';
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
	const normalized: Document = registry ? normalizeCompositeBlocks(doc, registry) : doc;
	const schema = registry ? schemaFromRegistry(registry) : undefined;
	const state: EditorState = EditorState.create({
		doc: normalized,
		schema,
	});
	replaceState(state);
}

/**
 * Normalizes composite blocks so bare inline children are wrapped in paragraphs.
 * Composite blocks (those with a `content` rule, e.g. table_cell) must contain
 * block-level children. When JSON input provides inline children directly,
 * this wraps them in a paragraph to enforce schema consistency.
 */
export function normalizeCompositeBlocks(doc: Document, registry: SchemaRegistry): Document {
	const children: readonly BlockNode[] = doc.children.map((block) =>
		normalizeBlock(block, registry),
	);
	return { children };
}

/** Leaf blocks use `content: { allow: ['text'] }`; composite blocks allow block types. */
function isCompositeContentRule(content: { readonly allow: readonly string[] }): boolean {
	return content.allow.length > 0 && !content.allow.includes('text');
}

function normalizeBlock(block: BlockNode, registry: SchemaRegistry): BlockNode {
	const spec = registry.getNodeSpec(block.type);

	// No content rule, or content allows 'text' → leaf block, no normalization needed
	if (!spec?.content || !isCompositeContentRule(spec.content)) return block;

	// Composite block with all-inline children → wrap in paragraph
	if (isLeafBlock(block)) {
		const children: readonly ChildNode[] | undefined =
			block.children.length > 0 ? block.children : undefined;
		const paragraph: BlockNode = createBlockNode(nodeType('paragraph'), children);
		return createBlockNode(block.type, [paragraph], block.id, block.attrs);
	}

	// Composite block with block children → recurse
	const normalized: readonly ChildNode[] = block.children.map((child) => {
		if (isTextNode(child) || isInlineNode(child)) return child;
		return normalizeBlock(child, registry);
	});
	return createBlockNode(block.type, normalized, block.id, block.attrs);
}

/** Returns sanitized HTML representation of the document. */
export function getEditorContentHTML(
	state: EditorState,
	registry: SchemaRegistry | undefined,
	options?: ContentHTMLOptions,
): string | ContentCSSResult {
	const doc: Document = state.doc;

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
export function setEditorContentHTML(
	html: string,
	registry: SchemaRegistry | undefined,
	replaceState: (state: EditorState) => void,
	options?: SetContentHTMLOptions,
): void {
	const doc: Document = parseHTMLToDocument(html, registry, options);
	setEditorJSON(doc, registry, replaceState);
}

/** Returns plain text content. */
export function getEditorText(state: EditorState): string {
	return state.doc.children.map((b) => getBlockText(b)).join('\n');
}

/**
 * Replaces editor content from plain text. Each `\n` becomes a paragraph.
 *
 * Existing top-level block IDs are reused in document order so that the
 * caret-preserving `replaceState()` keeps the cursor on the same block
 * across `setText(getText())` round-trips. Excess paragraphs receive
 * fresh IDs. When the new text is identical to the current text, the
 * call is a no-op — selection and history remain untouched.
 */
export function setEditorText(
	value: string,
	currentState: EditorState,
	registry: SchemaRegistry | undefined,
	replaceState: (state: EditorState) => void,
): void {
	if (value === getEditorText(currentState)) return;

	const lines: readonly string[] = value.split('\n');
	const existingIds: readonly BlockId[] = currentState.doc.children.map((b) => b.id);
	const blocks: readonly BlockNode[] = lines.map((line, idx) =>
		createBlockNode(nodeType('paragraph'), [createTextNode(line)], existingIds[idx]),
	);
	const schema = registry ? schemaFromRegistry(registry) : undefined;
	const next: EditorState = EditorState.create({
		doc: { children: blocks },
		schema,
	});
	replaceState(next);
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
