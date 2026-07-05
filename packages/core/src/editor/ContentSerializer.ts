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
	getBlockChildren,
	getBlockLength,
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
	MarkdownParseOptions,
	MarkdownSerializeOptions,
} from '../serialization/MarkdownTypes.js';
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
	const withMarks: Document = defaultMissingMarks(doc);
	const normalized: Document = registry ? normalizeCompositeBlocks(withMarks, registry) : withMarks;
	const schema = registry ? schemaFromRegistry(registry) : undefined;
	const state: EditorState = EditorState.create({
		doc: normalized,
		schema,
	});
	replaceState(state);
}

/**
 * Establishes the model invariant that every text and inline node carries a
 * `marks` array. External JSON may omit the field — notably documents persisted
 * before inline nodes gained marks (#197) — and the view layer reads
 * `child.marks` unconditionally, so a missing array must be defaulted here at
 * the JSON boundary rather than crash the reconciler later. Untouched nodes
 * keep their identity; a document that already satisfies the invariant is
 * returned as-is.
 */
function defaultMissingMarks(doc: Document): Document {
	const children: readonly BlockNode[] = mapPreservingIdentity(doc.children, defaultBlockMarks);
	return children === doc.children ? doc : { children };
}

function defaultBlockMarks(block: BlockNode): BlockNode {
	if (!block.children) return block;
	const children: readonly ChildNode[] = mapPreservingIdentity(block.children, (child) => {
		if (isTextNode(child) || isInlineNode(child)) {
			return child.marks ? child : { ...child, marks: [] };
		}
		return defaultBlockMarks(child);
	});
	return children === block.children ? block : { ...block, children };
}

/** Maps an array, returning the original array when no element changed. */
function mapPreservingIdentity<T>(items: readonly T[], map: (item: T) => T): readonly T[] {
	let changed = false;
	const mapped: readonly T[] = items.map((item) => {
		const next: T = map(item);
		if (next !== item) changed = true;
		return next;
	});
	return changed ? mapped : items;
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
		const result: ContentCSSResult = serializeDocumentToCSS(doc, registry, options);
		return options.pretty
			? { html: formatHTML(result.html), css: result.css, styleMap: result.styleMap }
			: result;
	}

	const html: string = serializeDocumentToHTML(doc, registry, options);
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

/**
 * Returns a Markdown representation of the document.
 *
 * The engine is loaded via dynamic `import()` so it stays code-split out of the
 * core bundle (D13) — this helper lives in `editor/`, which is statically
 * reachable from the web component, so a static import here would defeat the
 * split. Hence `async`.
 */
export async function getEditorContentMarkdown(
	state: EditorState,
	registry: SchemaRegistry | undefined,
	options?: MarkdownSerializeOptions,
): Promise<string> {
	const { serializeDocumentToMarkdown } = await import('../serialization/MarkdownSerializer.js');
	return serializeDocumentToMarkdown(state.doc, registry, options);
}

/**
 * Replaces editor content from Markdown.
 *
 * Reuses existing top-level block IDs in document order (exactly as
 * {@link setEditorText}), so `setContentMarkdown(getContentMarkdown())`
 * preserves block identity and keeps the caret stable for unchanged blocks per
 * the round-trip identity contract (ARCHITECTURE §9.2, D10). Async + lazy: the
 * parser is reached only via dynamic `import()` to keep the engine code-split
 * out of the core bundle (D13).
 */
export async function setEditorContentMarkdown(
	markdown: string,
	currentState: EditorState,
	registry: SchemaRegistry | undefined,
	replaceState: (state: EditorState) => void,
	options?: MarkdownParseOptions,
): Promise<void> {
	const { parseMarkdownToDocument } = await import('../serialization/MarkdownParser.js');
	const parsed: Document = parseMarkdownToDocument(markdown, registry, options);

	const existingIds: readonly BlockId[] = currentState.doc.children.map((b) => b.id);
	const reIdentified: readonly BlockNode[] = parsed.children.map((block, idx) => {
		const existing: BlockId | undefined = existingIds[idx];
		return existing ? createBlockNode(block.type, block.children, existing, block.attrs) : block;
	});

	setEditorJSON({ children: reIdentified }, registry, replaceState);
}

/** Returns plain text content, descending into container blocks (e.g. blockquote). */
export function getEditorText(state: EditorState): string {
	return state.doc.children.map(blockTreeText).join('\n');
}

/**
 * Extracts plain text from a block and all its descendants. Leaf blocks yield
 * their inline text; container blocks (blockquote, table, …) join their child
 * blocks' text with newlines, mirroring the line-per-block convention.
 */
function blockTreeText(block: BlockNode): string {
	if (isLeafBlock(block)) return getBlockText(block);
	return getBlockChildren(block).map(blockTreeText).join('\n');
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
	// getBlockLength counts InlineNodes (e.g. an inline formula) as width 1, so a
	// paragraph holding only an atomic inline node is correctly treated as non-empty.
	return block.type === 'paragraph' && getBlockLength(block) === 0;
}
