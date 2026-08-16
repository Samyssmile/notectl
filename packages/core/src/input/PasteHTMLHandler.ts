/**
 * Handles paste of HTML and plain text from the system clipboard.
 * Sanitizes HTML with DOMPurify, normalizes legacy markup, and delegates
 * to HTMLParser or DocumentParser as appropriate.
 */

import {
	type InsertionContext,
	canContainerHoldBlocks,
	cloneBlockWithNewIds,
	findBlockRecursive,
	resolveRootEscapeContext,
	resolveRootInsertionContext,
} from '../commands/BlockInsertion.js';
import {
	addDeleteSelectionSteps,
	findLastLeafBlockId,
	insertTextCommand,
} from '../commands/Commands.js';
import { pasteSlice } from '../commands/PasteCommand.js';
import { hasVisibleTextContent, plainTextSlice, sliceHasContent } from '../model/ContentSlice.js';
import { type BlockNode, generateBlockId, getBlockText } from '../model/Document.js';
import { normalizeCompositeBlocks } from '../model/DocumentNormalization.js';
import { SAFE_URI_REGEXP } from '../model/HTMLUtils.js';
import { schemaFromRegistry } from '../model/Schema.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	type EditorSelection,
	createCollapsedSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
	isTextSelection,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { preserveHTMLIdSanitizeConfig, sanitizeHTML } from '../serialization/HTMLSanitization.js';
import { parseHTMLToDocument } from '../serialization/index.js';
import type { EditorState } from '../state/EditorState.js';
import { HTMLParser } from './HTMLParser.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';
import { normalizeLegacyHTML } from './LegacyHTMLNormalizer.js';

/** Tags forbidden in pre-sanitization (active content that must never reach innerHTML). */
const PRE_SANITIZE_FORBID: string[] = [
	'script',
	'style',
	'iframe',
	'object',
	'embed',
	'form',
	'noscript',
];

/** Block roots represented directly by the document model. */
const MODELLED_BLOCK_TAGS: ReadonlySet<string> = new Set([
	'p',
	'div',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'li',
	'blockquote',
	'table',
	'tr',
	'td',
	'th',
	'pre',
	'figure',
	'hr',
]);

export class PasteHTMLHandler {
	constructor(
		private readonly getState: GetStateFn,
		private readonly dispatch: DispatchFn,
		private readonly schemaRegistry: SchemaRegistry | undefined,
		private readonly tryRichPasteFromJson: (json: string, state?: EditorState) => boolean,
	) {}

	/** Handles HTML or plain text paste from system clipboard. */
	handleHTMLOrTextPaste(
		clipboardData: DataTransfer,
		plainText: string,
		selection?: EditorSelection,
	): void {
		const state = this.stateAtSelection(selection);
		const html: string = clipboardData.getData('text/html');

		if (html) {
			this.handleHTML(html, state);
			return;
		}

		if (plainText) this.pastePlainText(plainText, selection);
	}

	/** Inserts plain text through the standard paste pipeline (no HTML interpretation). */
	pastePlainText(text: string, selection?: EditorSelection): void {
		if (!text) return;
		const slice = plainTextSlice(text);
		this.dispatch(pasteSlice(this.stateAtSelection(selection), slice));
	}

	/**
	 * Inserts a pre-built HTML string through the standard paste pipeline.
	 * Returns whether the HTML materialized content (a claimed rich paste or a
	 * dispatched insertion). Markup that parses to nothing reports false so the
	 * caller can fall back to another clipboard flavor (#216).
	 */
	pasteHTMLString(html: string, selection?: EditorSelection): boolean {
		return this.handleHTML(html, this.stateAtSelection(selection));
	}

	/** Sanitizes and processes pasted HTML content. Returns whether content materialized. */
	private handleHTML(html: string, state: EditorState): boolean {
		// The pre-sanitize pass scrubs active content while keeping DOMPurify's
		// broad default allowlist so legacy normalization still sees deprecated
		// tags (`<font>`, `<center>`, ...). Schema-registered tags/attrs are added
		// on top (`ADD_TAGS`/`ADD_ATTR`) so plugin markup outside DOMPurify's
		// defaults survives this first pass — notably MathML `<semantics>` and
		// `<annotation>` (and its `encoding` attr), which carry a formula's LaTeX
		// source. Without this they are stripped here before the registry-aware
		// passes run, dropping the annotation and leaving the formula uneditable.
		const preSanitized: string = sanitizeHTML(
			html,
			{
				FORBID_TAGS: PRE_SANITIZE_FORBID,
				ADD_TAGS: this.schemaRegistry ? this.schemaRegistry.getAllowedTags() : [],
				ADD_ATTR: this.schemaRegistry ? this.schemaRegistry.getAllowedAttrs() : [],
				ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
				...preserveHTMLIdSanitizeConfig(),
			},
			this.schemaRegistry,
		);
		const richJson: string | undefined = this.extractRichData(preSanitized);
		if (richJson && this.tryRichPasteFromJson(richJson, state)) return true;

		const preTemplate: HTMLTemplateElement = document.createElement('template');
		preTemplate.innerHTML = preSanitized;
		normalizeLegacyHTML(preTemplate.content);
		const normalizedHTML: string = preTemplate.innerHTML;

		const allowedTags: string[] = this.schemaRegistry
			? this.schemaRegistry.getAllowedTags()
			: ['strong', 'em', 'u', 'b', 'i', 'p', 'br', 'div', 'span'];
		const allowedAttrs: string[] = this.schemaRegistry ? this.schemaRegistry.getAllowedAttrs() : [];
		const sanitized: string = sanitizeHTML(
			normalizedHTML,
			{
				ALLOWED_TAGS: allowedTags,
				ALLOWED_ATTR: allowedAttrs,
				ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
				...preserveHTMLIdSanitizeConfig(),
			},
			this.schemaRegistry,
		);

		if (this.schemaRegistry) {
			const template: HTMLTemplateElement = document.createElement('template');
			template.innerHTML = sanitized;

			if (this.requiresDocumentParser(sanitized, template.content)) {
				return this.handleDocumentPaste(sanitized, state);
			}

			const schema = schemaFromRegistry(this.schemaRegistry);
			const parser = new HTMLParser({
				schema,
				schemaRegistry: this.schemaRegistry,
			});
			// `<br>`-only markup deliberately parses into empty split blocks (blank
			// lines), so a line break is a content signal even when every block ends
			// up empty. Without any signal, dispatching would consume a range
			// selection while inserting nothing, ahead of the caller's fallback to
			// another clipboard flavor (#216).
			const hasLineBreak: boolean = template.content.querySelector('br') !== null;
			const slice = parser.parse(template.content);
			if (!sliceHasContent(slice) && !hasLineBreak) return false;
			this.dispatch(pasteSlice(state, slice));
			return true;
		}
		const text: string = this.extractTextFromHTML(sanitized);
		if (!hasVisibleTextContent(text)) return false;
		this.dispatch(insertTextCommand(state, text, 'paste'));
		return true;
	}

	/** Extracts embedded rich block JSON from HTML (data-notectl-rich). */
	private extractRichData(html: string): string | undefined {
		const template: HTMLTemplateElement = document.createElement('template');
		template.innerHTML = html;
		const richEl: Element | null = template.content.querySelector('[data-notectl-rich]');
		const encoded: string | null | undefined = richEl?.getAttribute('data-notectl-rich');
		if (!encoded) return undefined;
		return this.decodeHTMLEntities(encoded);
	}

	/** Decodes HTML entities produced by ClipboardHandler's encoding. */
	private decodeHTMLEntities(text: string): string {
		return text
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&gt;/g, '>')
			.replace(/&lt;/g, '<')
			.replace(/&amp;/g, '&');
	}

	/**
	 * Checks whether HTML requires the DocumentParser (tables, blockquotes,
	 * multi-block list items, void blocks).
	 */
	private requiresDocumentParser(html: string, container: DocumentFragment): boolean {
		if (this.containsModelledBlockID(container)) return true;
		if (/<table[\s>]/i.test(html)) return true;
		// Blockquotes are container blocks (#136): the flat HTMLParser/slice path
		// cannot represent their nested block children, so route them through the
		// container-aware DocumentParser to preserve nesting (and to wrap inline
		// content in a paragraph rather than producing an invalid flat blockquote).
		if (/<blockquote[\s>]/i.test(html)) return true;
		// Multi-block list items are containers too (#194): the slice path would
		// silently flatten a second paragraph or a nested code block into the
		// item's inline text.
		if (/<li[\s>]/i.test(html) && this.containsMultiBlockListItem(container)) return true;
		return this.containsVoidBlockElements(container);
	}

	/** Semantic IDs belong to whole blocks, which the flat slice parser cannot represent. */
	private containsModelledBlockID(container: DocumentFragment): boolean {
		const blockRuleTags: ReadonlySet<string> = new Set(
			this.schemaRegistry?.getBlockParseRules().map((entry) => entry.rule.tag) ?? [],
		);
		for (const element of Array.from(container.querySelectorAll('[id]'))) {
			const tag: string = element.tagName.toLowerCase();
			if (MODELLED_BLOCK_TAGS.has(tag) || blockRuleTags.has(tag)) return true;
		}
		return false;
	}

	/**
	 * Whether any `<li>` carries block content beyond a single paragraph: two or
	 * more block-level children, a non-paragraph block child (code, quote,
	 * heading, rule), or a block child mixed with inline content. Nested lists
	 * and the checklist checkbox stay on the flat path — the slice model
	 * represents those losslessly.
	 */
	private containsMultiBlockListItem(container: DocumentFragment): boolean {
		const nonParagraphBlockTags: ReadonlySet<string> = new Set([
			'PRE',
			'BLOCKQUOTE',
			'TABLE',
			'HR',
			'H1',
			'H2',
			'H3',
			'H4',
			'H5',
			'H6',
		]);
		for (const li of Array.from(container.querySelectorAll('li'))) {
			let paragraphCount = 0;
			let hasInlineContent = false;
			for (const child of Array.from(li.childNodes)) {
				if (child.nodeType === Node.ELEMENT_NODE) {
					const tag: string = (child as Element).tagName;
					if (tag === 'UL' || tag === 'OL' || tag === 'INPUT' || tag === 'LI') continue;
					if (nonParagraphBlockTags.has(tag)) return true;
					if (tag === 'P' || tag === 'DIV') {
						paragraphCount++;
						continue;
					}
					hasInlineContent = true;
				} else if (child.nodeType === Node.TEXT_NODE) {
					if ((child.textContent ?? '').trim() !== '') hasInlineContent = true;
				}
			}
			if (paragraphCount >= 2 || (paragraphCount >= 1 && hasInlineContent)) return true;
		}
		return false;
	}

	/** Checks whether a DOM fragment contains elements matching void block parse rules. */
	private containsVoidBlockElements(container: DocumentFragment): boolean {
		if (!this.schemaRegistry) return false;
		const blockRules = this.schemaRegistry.getBlockParseRules();
		for (const entry of blockRules) {
			const spec = this.schemaRegistry.getNodeSpec(entry.type);
			if (!spec?.isVoid) continue;
			const elements: NodeListOf<Element> = container.querySelectorAll(entry.rule.tag);
			for (const el of Array.from(elements)) {
				if (!entry.rule.getAttrs) return true;
				const attrs = entry.rule.getAttrs(el as HTMLElement);
				if (attrs !== false) return true;
			}
		}
		return false;
	}

	/**
	 * Handles paste of HTML requiring the DocumentParser (tables, void blocks).
	 * Returns whether a transaction was dispatched.
	 */
	private handleDocumentPaste(html: string, state: EditorState): boolean {
		if (!this.schemaRegistry) return false;

		const parsed = parseHTMLToDocument(html, this.schemaRegistry);
		const doc = normalizeCompositeBlocks(parsed, this.schemaRegistry);
		if (doc.children.length === 0) return false;

		const sel = state.selection;
		const builder = state.transaction('paste');

		let landingId: BlockId | undefined;
		if (isTextSelection(sel) && !isCollapsed(sel)) {
			landingId = addDeleteSelectionSteps(state, builder);
		}

		const anchorBlockId: BlockId =
			landingId ??
			(isNodeSelection(sel) ? sel.nodeId : isGapCursor(sel) ? sel.blockId : sel.anchor.blockId);

		const ctx = resolveRootInsertionContext(state, anchorBlockId, this.schemaRegistry);
		if (!ctx) return false;

		// Schema guard (#166): a container such as a table cell does not allow every
		// block type. When the parsed blocks do not fit the target container, escape
		// the insertion to the document root, placing them after the top-level
		// ancestor (e.g. the outer table) rather than producing schema-invalid
		// nesting like a table inside a table cell.
		const containerId: BlockId | undefined = ctx.parentPath[ctx.parentPath.length - 1];
		const containerType: string | undefined = containerId
			? state.getBlock(containerId)?.type
			: undefined;
		const targetCtx: InsertionContext | undefined = canContainerHoldBlocks(
			this.schemaRegistry,
			containerType,
			doc.children,
		)
			? ctx
			: resolveRootEscapeContext(state, anchorBlockId);
		if (!targetCtx) return false;

		const insertOffset: number = isGapCursor(sel) && sel.side === 'before' ? 0 : 1;
		let insertIndex: number = targetCtx.anchorIndex + insertOffset;
		let lastBlockId: BlockId | undefined;
		let lastClonedRoot: BlockNode | undefined;

		for (const block of doc.children) {
			const newId: BlockId = generateBlockId();
			const cloned: BlockNode = cloneBlockWithNewIds(block, newId);
			builder.insertNode(targetCtx.parentPath, insertIndex, cloned);
			insertIndex++;
			lastBlockId = findLastLeafBlockId(cloned);
			lastClonedRoot = cloned;
		}

		if (targetCtx.isAnchorEmpty && !isGapCursor(sel)) {
			builder.removeNode(targetCtx.parentPath, targetCtx.anchorIndex);
		}

		if (lastBlockId && lastClonedRoot) {
			const lastBlock = findBlockRecursive(lastClonedRoot, lastBlockId);
			const len: number = lastBlock ? getBlockText(lastBlock).length : 0;
			builder.setSelection(createCollapsedSelection(lastBlockId, len));
		}

		this.dispatch(builder.build());
		return true;
	}

	private extractTextFromHTML(html: string): string {
		const template: HTMLTemplateElement = document.createElement('template');
		template.innerHTML = html;
		return template.content.textContent ?? '';
	}

	private stateAtSelection(selection?: EditorSelection): EditorState {
		const state = this.getState();
		return selection ? state.withSelection(selection) : state;
	}
}
