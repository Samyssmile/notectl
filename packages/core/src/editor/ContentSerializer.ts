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
	getBlockText,
	isInlineNode,
	isLeafBlock,
	isTextNode,
} from '../model/Document.js';
import { formatHTML } from '../model/HTMLUtils.js';
import { schemaFromRegistry } from '../model/Schema.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { blockId, nodeType } from '../model/TypeBrands.js';
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
		selection: createCollapsedSelection(normalized.children[0]?.id ?? blockId(''), 0),
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
