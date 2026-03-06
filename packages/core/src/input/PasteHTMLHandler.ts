/**
 * Handles paste of HTML and plain text from the system clipboard.
 * Sanitizes HTML with DOMPurify, normalizes legacy markup, and delegates
 * to HTMLParser or DocumentParser as appropriate.
 */

import DOMPurify from 'dompurify';
import {
	cloneBlockWithNewIds,
	findBlockRecursive,
	resolveRootInsertionContext,
} from '../commands/BlockInsertion.js';
import {
	addDeleteSelectionSteps,
	findLastLeafBlockId,
	insertTextCommand,
} from '../commands/Commands.js';
import { pasteSlice } from '../commands/PasteCommand.js';
import { plainTextSlice } from '../model/ContentSlice.js';
import { type BlockNode, generateBlockId, getBlockText } from '../model/Document.js';
import { SAFE_URI_REGEXP } from '../model/HTMLUtils.js';
import { schemaFromRegistry } from '../model/Schema.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	createCollapsedSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
	isTextSelection,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
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

export class PasteHTMLHandler {
	constructor(
		private readonly getState: GetStateFn,
		private readonly dispatch: DispatchFn,
		private readonly schemaRegistry: SchemaRegistry | undefined,
		private readonly tryRichPasteFromJson: (json: string) => boolean,
	) {}

	/** Handles HTML or plain text paste from system clipboard. */
	handleHTMLOrTextPaste(clipboardData: DataTransfer, plainText: string): void {
		const state = this.getState();
		const html: string = clipboardData.getData('text/html');

		if (html) {
			this.handleHTML(html, state);
			return;
		}

		if (plainText) {
			const slice = plainTextSlice(plainText);
			this.dispatch(pasteSlice(this.getState(), slice));
		}
	}

	/** Sanitizes and processes pasted HTML content. */
	private handleHTML(html: string, state: EditorState): void {
		const preSanitized: string = DOMPurify.sanitize(html, {
			FORBID_TAGS: PRE_SANITIZE_FORBID,
			ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
		});
		const richJson: string | undefined = this.extractRichData(preSanitized);
		if (richJson && this.tryRichPasteFromJson(richJson)) return;

		const preTemplate: HTMLTemplateElement = document.createElement('template');
		preTemplate.innerHTML = preSanitized;
		normalizeLegacyHTML(preTemplate.content);
		const normalizedHTML: string = preTemplate.innerHTML;

		const allowedTags: string[] = this.schemaRegistry
			? this.schemaRegistry.getAllowedTags()
			: ['strong', 'em', 'u', 'b', 'i', 'p', 'br', 'div', 'span'];
		const allowedAttrs: string[] = this.schemaRegistry ? this.schemaRegistry.getAllowedAttrs() : [];
		const sanitized: string = DOMPurify.sanitize(normalizedHTML, {
			ALLOWED_TAGS: allowedTags,
			ALLOWED_ATTR: allowedAttrs,
			ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
		});

		if (this.schemaRegistry) {
			const template: HTMLTemplateElement = document.createElement('template');
			template.innerHTML = sanitized;

			if (this.requiresDocumentParser(sanitized, template.content)) {
				this.handleDocumentPaste(sanitized, state);
				return;
			}

			const schema = schemaFromRegistry(this.schemaRegistry);
			const parser = new HTMLParser({
				schema,
				schemaRegistry: this.schemaRegistry,
			});
			const slice = parser.parse(template.content);
			this.dispatch(pasteSlice(state, slice));
		} else {
			const text: string = this.extractTextFromHTML(sanitized);
			if (text) this.dispatch(insertTextCommand(state, text, 'paste'));
		}
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

	/** Checks whether HTML requires the DocumentParser (tables, void blocks). */
	private requiresDocumentParser(html: string, container: DocumentFragment): boolean {
		if (/<table[\s>]/i.test(html)) return true;
		return this.containsVoidBlockElements(container);
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

	/** Handles paste of HTML requiring the DocumentParser (tables, void blocks). */
	private handleDocumentPaste(html: string, state: EditorState): void {
		if (!this.schemaRegistry) return;

		const doc = parseHTMLToDocument(html, this.schemaRegistry);
		if (doc.children.length === 0) return;

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
		if (!ctx) return;

		const insertOffset: number = isGapCursor(sel) && sel.side === 'before' ? 0 : 1;
		let insertIndex: number = ctx.anchorIndex + insertOffset;
		let lastBlockId: BlockId | undefined;
		let lastClonedRoot: BlockNode | undefined;

		for (const block of doc.children) {
			const newId: BlockId = generateBlockId();
			const cloned: BlockNode = cloneBlockWithNewIds(block, newId);
			builder.insertNode(ctx.parentPath, insertIndex, cloned);
			insertIndex++;
			lastBlockId = findLastLeafBlockId(cloned);
			lastClonedRoot = cloned;
		}

		if (ctx.isAnchorEmpty && !isGapCursor(sel)) {
			builder.removeNode(ctx.parentPath, ctx.anchorIndex);
		}

		if (lastBlockId && lastClonedRoot) {
			const lastBlock = findBlockRecursive(lastClonedRoot, lastBlockId);
			const len: number = lastBlock ? getBlockText(lastBlock).length : 0;
			builder.setSelection(createCollapsedSelection(lastBlockId, len));
		}

		this.dispatch(builder.build());
	}

	private extractTextFromHTML(html: string): string {
		const template: HTMLTemplateElement = document.createElement('template');
		template.innerHTML = html;
		return template.content.textContent ?? '';
	}
}
