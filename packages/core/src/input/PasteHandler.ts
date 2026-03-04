/**
 * Paste handler: intercepts paste events and converts clipboard content to transactions.
 * Supports file paste via registered FileHandlers, plain text, and HTML.
 */

import DOMPurify from 'dompurify';
import {
	type InsertionContext,
	cloneBlockWithNewIds,
	createBlockFromRichData,
	findBlockRecursive,
	findTableCellAncestor,
	resolveCellInsertionContext,
	resolveRootInsertionContext,
	sanitizeAttrs,
	validateRichBlockData,
} from '../commands/BlockInsertion.js';
import {
	addDeleteSelectionSteps,
	findLastLeafBlockId,
	insertTextCommand,
} from '../commands/Commands.js';
import { pasteSlice } from '../commands/PasteCommand.js';
import { plainTextSlice } from '../model/ContentSlice.js';
import {
	type BlockAttrs,
	type BlockNode,
	createBlockNode,
	generateBlockId,
	getBlockText,
} from '../model/Document.js';
import type { FileHandlerRegistry } from '../model/FileHandlerRegistry.js';
import { SAFE_URI_REGEXP } from '../model/HTMLUtils.js';
import type { PasteInterceptorEntry } from '../model/PasteInterceptor.js';
import { schemaFromRegistry } from '../model/Schema.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
	isTextSelection,
} from '../model/Selection.js';
import type { BlockId, NodeTypeName } from '../model/TypeBrands.js';
import { nodeType } from '../model/TypeBrands.js';
import { parseHTMLToDocument } from '../serialization/index.js';
import type { EditorState } from '../state/EditorState.js';
import { HTMLParser } from './HTMLParser.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';
import { type RichBlockData, consumeRichClipboard } from './InternalClipboard.js';
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

export interface PasteHandlerOptions {
	readonly getState: GetStateFn;
	readonly dispatch: DispatchFn;
	readonly schemaRegistry?: SchemaRegistry;
	readonly fileHandlerRegistry?: FileHandlerRegistry;
	readonly isReadOnly?: () => boolean;
	readonly getPasteInterceptors?: () => readonly PasteInterceptorEntry[];
}

export class PasteHandler {
	private readonly getState: GetStateFn;
	private readonly dispatch: DispatchFn;
	private readonly schemaRegistry?: SchemaRegistry;
	private readonly fileHandlerRegistry?: FileHandlerRegistry;
	private readonly isReadOnly: () => boolean;
	private readonly getPasteInterceptors: () => readonly PasteInterceptorEntry[];
	private readonly handlePaste: (e: ClipboardEvent) => void;

	constructor(
		private readonly element: HTMLElement,
		options: PasteHandlerOptions,
	) {
		this.getState = options.getState;
		this.dispatch = options.dispatch;
		this.schemaRegistry = options.schemaRegistry;
		this.fileHandlerRegistry = options.fileHandlerRegistry;
		this.isReadOnly = options.isReadOnly ?? (() => false);
		this.getPasteInterceptors = options.getPasteInterceptors ?? (() => []);

		this.handlePaste = this.onPaste.bind(this);
		element.addEventListener('paste', this.handlePaste);
	}

	private onPaste(e: ClipboardEvent): void {
		e.preventDefault();
		if (this.isReadOnly()) return;

		const clipboardData = e.clipboardData;
		if (!clipboardData) return;

		const blockJson: string = clipboardData.getData('application/x-notectl-block');
		if (blockJson) {
			this.handleBlockPaste(blockJson);
			return;
		}

		if (this.handleFilePaste(clipboardData)) return;

		const plainText: string = clipboardData.getData('text/plain');
		if (plainText) {
			const richBlocks: readonly RichBlockData[] | undefined = consumeRichClipboard(plainText);
			if (richBlocks && this.handleRichPaste(richBlocks)) return;
		}

		// Paste interceptors (plugins can claim the paste before default handling)
		const html: string = clipboardData.getData('text/html');
		if (plainText && this.tryPasteInterceptors(plainText, html)) {
			return;
		}

		this.handleHTMLOrTextPaste(clipboardData, plainText);
	}

	/** Runs paste interceptors in priority order. Returns true if one claimed the paste. */
	private tryPasteInterceptors(plainText: string, html: string): boolean {
		const interceptors = this.getPasteInterceptors();
		const state = this.getState();
		for (const entry of interceptors) {
			const tr = entry.interceptor(plainText, html, state);
			if (tr) {
				this.dispatch(tr);
				return true;
			}
		}
		return false;
	}

	/** Handles HTML or plain text paste from system clipboard. */
	private handleHTMLOrTextPaste(clipboardData: DataTransfer, plainText: string): void {
		const state = this.getState();
		const html = clipboardData.getData('text/html');

		if (html) {
			const preSanitized: string = DOMPurify.sanitize(html, {
				FORBID_TAGS: PRE_SANITIZE_FORBID,
				ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
			});
			const richJson: string | undefined = this.extractRichData(preSanitized);
			if (richJson && this.handleRichPasteFromJson(richJson)) return;

			const preTemplate: HTMLTemplateElement = document.createElement('template');
			preTemplate.innerHTML = preSanitized;
			normalizeLegacyHTML(preTemplate.content);
			const normalizedHTML: string = preTemplate.innerHTML;

			const allowedTags: string[] = this.schemaRegistry
				? this.schemaRegistry.getAllowedTags()
				: ['strong', 'em', 'u', 'b', 'i', 'p', 'br', 'div', 'span'];
			const allowedAttrs: string[] = this.schemaRegistry
				? this.schemaRegistry.getAllowedAttrs()
				: [];
			const sanitized = DOMPurify.sanitize(normalizedHTML, {
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
				const text = this.extractTextFromHTML(sanitized);
				if (text) this.dispatch(insertTextCommand(state, text, 'paste'));
			}
			return;
		}

		if (plainText) {
			const slice = plainTextSlice(plainText);
			this.dispatch(pasteSlice(this.getState(), slice));
		}
	}

	/** Handles paste of an internal block node from ClipboardHandler. */
	private handleBlockPaste(json: string): void {
		let parsed: { type?: string; attrs?: Record<string, unknown> };
		try {
			parsed = JSON.parse(json) as { type?: string; attrs?: Record<string, unknown> };
		} catch {
			return;
		}

		const typeName: string | undefined = parsed.type;
		if (!typeName) return;

		const spec = this.schemaRegistry?.getNodeSpec(typeName);
		if (this.schemaRegistry && !spec) return;

		const state = this.getState();
		const sel = state.selection;
		const anchorBlockId: BlockId = isNodeSelection(sel)
			? sel.nodeId
			: isGapCursor(sel)
				? sel.blockId
				: sel.anchor.blockId;

		const newBlockId: BlockId = generateBlockId();
		const attrs: BlockAttrs | undefined = sanitizeAttrs(parsed.attrs, spec?.attrs) as
			| BlockAttrs
			| undefined;
		const newBlock: BlockNode = createBlockNode(
			nodeType(typeName) as NodeTypeName,
			undefined,
			newBlockId,
			attrs,
		);

		// Table cell: insert as last child
		const cellId: BlockId | undefined = findTableCellAncestor(state, anchorBlockId);
		if (cellId) {
			const ctx = resolveCellInsertionContext(state, anchorBlockId, cellId, this.schemaRegistry);
			if (!ctx) return;
			const cell: BlockNode | undefined = state.getBlock(cellId);
			if (!cell) return;

			const builder = state.transaction('paste');
			builder.insertNode(ctx.parentPath, cell.children.length, newBlock);
			builder.setSelection(createNodeSelection(newBlockId, [...ctx.parentPath, newBlockId]));
			this.dispatch(builder.build());
			return;
		}

		// Root: insert after anchor
		const ctx = resolveRootInsertionContext(state, anchorBlockId, this.schemaRegistry);
		if (!ctx) return;

		const insertOffset: number = isGapCursor(sel) && sel.side === 'before' ? 0 : 1;
		const builder = state.transaction('paste');
		builder.insertNode(ctx.parentPath, ctx.anchorIndex + insertOffset, newBlock);
		builder.setSelection(createNodeSelection(newBlockId, [...ctx.parentPath, newBlockId]));
		this.dispatch(builder.build());
	}

	/** Parses JSON and delegates to handleRichPaste (for HTML-embedded data). */
	private handleRichPasteFromJson(json: string): boolean {
		let blocks: RichBlockData[];
		try {
			blocks = JSON.parse(json) as RichBlockData[];
		} catch {
			return false;
		}
		if (!Array.isArray(blocks) || blocks.length === 0) return false;
		return this.handleRichPaste(blocks);
	}

	/**
	 * Handles paste of rich block data (text selections carrying block structure).
	 * Returns true if handled, false to fall through to plain-text paste.
	 */
	private handleRichPaste(blocks: readonly RichBlockData[]): boolean {
		if (blocks.length === 0) return false;

		const hasStructured: boolean = blocks.some(
			(b) => b.type !== undefined && b.type !== 'paragraph',
		);
		if (!hasStructured && blocks.length <= 1) return false;

		let state = this.getState();
		const sel = state.selection;

		if (isTextSelection(sel) && !isCollapsed(sel)) {
			const delBuilder = state.transaction('paste');
			const landingId: BlockId | undefined = addDeleteSelectionSteps(state, delBuilder);
			const delTr = delBuilder.build();
			this.dispatch(delTr);
			state = state.apply(delTr);
			if (landingId) {
				return this.resolveAndInsertRichBlocks(blocks, state, landingId);
			}
		}

		const anchorBlockId: BlockId = isNodeSelection(sel)
			? sel.nodeId
			: isGapCursor(sel)
				? sel.blockId
				: sel.anchor.blockId;

		return this.resolveAndInsertRichBlocks(blocks, state, anchorBlockId);
	}

	/** Resolves insertion context (cell or root) and inserts rich blocks. */
	private resolveAndInsertRichBlocks(
		blocks: readonly RichBlockData[],
		state: EditorState,
		anchorBlockId: BlockId,
	): boolean {
		const sel = state.selection;
		const cellId: BlockId | undefined = findTableCellAncestor(state, anchorBlockId);

		if (cellId) {
			const ctx = resolveCellInsertionContext(state, anchorBlockId, cellId, this.schemaRegistry);
			if (!ctx) return false;
			const cell: BlockNode | undefined = state.getBlock(cellId);
			const startIndex: number =
				ctx.anchorIndex >= 0 ? ctx.anchorIndex + 1 : (cell?.children.length ?? 0);
			return this.insertRichBlocks(blocks, state, ctx, startIndex, true);
		}

		const ctx = resolveRootInsertionContext(state, anchorBlockId, this.schemaRegistry);
		if (!ctx) return false;
		const insertOffset: number = isGapCursor(sel) && sel.side === 'before' ? 0 : 1;
		return this.insertRichBlocks(
			blocks,
			state,
			ctx,
			ctx.anchorIndex + insertOffset,
			!isGapCursor(sel),
		);
	}

	/** Inserts validated rich blocks at the resolved position. */
	private insertRichBlocks(
		blocks: readonly RichBlockData[],
		state: EditorState,
		context: InsertionContext,
		startIndex: number,
		removeEmptyAnchor: boolean,
	): boolean {
		const builder = state.transaction('paste');
		let insertIndex: number = startIndex;
		let lastBlockId: BlockId | undefined;
		let lastTextLen = 0;

		for (const raw of blocks) {
			const blockData = validateRichBlockData(raw, this.schemaRegistry);
			if (!blockData) continue;

			const newBlock: BlockNode = createBlockFromRichData(blockData);
			builder.insertNode(context.parentPath, insertIndex, newBlock);
			insertIndex++;
			lastBlockId = newBlock.id;
			lastTextLen = (blockData.text ?? '').length;
		}

		if (removeEmptyAnchor && context.isAnchorEmpty && context.anchorIndex >= 0) {
			builder.removeNode(context.parentPath, context.anchorIndex);
		}

		if (lastBlockId) {
			builder.setSelection(createCollapsedSelection(lastBlockId, lastTextLen));
		}

		this.dispatch(builder.build());
		return true;
	}

	/** Checks for files in clipboard data and delegates to registered handlers. */
	private handleFilePaste(clipboardData: DataTransfer): boolean {
		if (!this.fileHandlerRegistry) return false;

		const files: File[] = Array.from(clipboardData.files);
		if (files.length === 0) {
			for (let i = 0; i < clipboardData.items.length; i++) {
				const item = clipboardData.items[i];
				if (item && item.kind === 'file') {
					const file = item.getAsFile();
					if (file) files.push(file);
				}
			}
		}

		if (files.length === 0) return false;

		let handled = false;
		for (const file of files) {
			const handlers = this.fileHandlerRegistry.matchFileHandlers(file.type);
			for (const handler of handlers) {
				const result = handler(file, null);
				if (result === true || result instanceof Promise) {
					handled = true;
					break;
				}
			}
		}
		return handled;
	}

	/** Extracts embedded rich block JSON from HTML (data-notectl-rich). */
	private extractRichData(html: string): string | undefined {
		const template = document.createElement('template');
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
		const template = document.createElement('template');
		template.innerHTML = html;
		return template.content.textContent ?? '';
	}

	destroy(): void {
		this.element.removeEventListener('paste', this.handlePaste);
	}
}
