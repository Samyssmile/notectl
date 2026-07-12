/**
 * Paste handler: intercepts paste events and routes clipboard content
 * to specialized handlers for HTML, rich blocks, files, and plain text.
 */

import type { FileHandlerRegistry } from '../model/FileHandlerRegistry.js';
import type { MarkdownSyntaxExtension } from '../model/MarkdownSyntaxRegistry.js';
import type { PasteInterceptorEntry } from '../model/PasteInterceptor.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import { isEventFromEditorContent } from '../platform/EditorEventBoundary.js';
import { serializeDocumentToHTML } from '../serialization/DocumentSerializer.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';
import { looksLikeMarkdown } from './MarkdownPasteDetector.js';
import { PasteHTMLHandler } from './PasteHTMLHandler.js';
import { PasteRichBlockHandler } from './PasteRichBlockHandler.js';

/** Markdown auto-detection mode for the paste pipeline. */
export type PasteMarkdownMode = 'auto' | 'never';

/** Whether the clipboard `text/html` payload carries real markup worth preferring. */
function hasUsableHtml(html: string): boolean {
	return html.trim() !== '' && /<\w/.test(html);
}

export interface PasteHandlerOptions {
	readonly getState: GetStateFn;
	readonly dispatch: DispatchFn;
	readonly schemaRegistry?: SchemaRegistry;
	readonly fileHandlerRegistry?: FileHandlerRegistry;
	readonly isReadOnly?: () => boolean;
	readonly getPasteInterceptors?: () => readonly PasteInterceptorEntry[];
	/** Markdown paste auto-detection. Default `auto`. */
	readonly pasteMarkdown?: PasteMarkdownMode;
	/** Supplies plugin-contributed Markdown syntax extensions (formula `$...$`). */
	readonly getMarkdownSyntaxExtensions?: () => readonly MarkdownSyntaxExtension[];
	/** Writes a message to the screen-reader live region after a successful Markdown paste. */
	readonly announce?: (text: string) => void;
	/** Localized announcement made after Markdown is imported. Defaults to `'Markdown imported'`. */
	readonly markdownImportedMessage?: string;
}

export class PasteHandler {
	private readonly getState: GetStateFn;
	private readonly dispatch: DispatchFn;
	private readonly schemaRegistry?: SchemaRegistry;
	private readonly fileHandlerRegistry?: FileHandlerRegistry;
	private readonly isReadOnly: () => boolean;
	private readonly getPasteInterceptors: () => readonly PasteInterceptorEntry[];
	private readonly pasteMarkdown: PasteMarkdownMode;
	private readonly getMarkdownSyntaxExtensions: () => readonly MarkdownSyntaxExtension[];
	private readonly announce?: (text: string) => void;
	private readonly markdownImportedMessage: string;
	private readonly handlePaste: (e: ClipboardEvent) => void;
	private readonly htmlHandler: PasteHTMLHandler;
	private readonly richBlockHandler: PasteRichBlockHandler;

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
		this.pasteMarkdown = options.pasteMarkdown ?? 'auto';
		this.getMarkdownSyntaxExtensions = options.getMarkdownSyntaxExtensions ?? (() => []);
		this.announce = options.announce;
		this.markdownImportedMessage = options.markdownImportedMessage ?? 'Markdown imported';

		this.richBlockHandler = new PasteRichBlockHandler(
			options.getState,
			options.dispatch,
			options.schemaRegistry,
		);
		this.htmlHandler = new PasteHTMLHandler(
			options.getState,
			options.dispatch,
			options.schemaRegistry,
			(json: string) => this.richBlockHandler.handleRichPasteFromJson(json),
		);

		this.handlePaste = this.onPaste.bind(this);
		element.addEventListener('paste', this.handlePaste);
	}

	private onPaste(e: ClipboardEvent): void {
		if (!isEventFromEditorContent(e, this.element)) return;
		e.preventDefault();
		if (this.isReadOnly()) return;

		const clipboardData = e.clipboardData;
		if (!clipboardData) return;

		const blockJson: string = clipboardData.getData('application/x-notectl-block');
		if (blockJson) {
			this.richBlockHandler.handleBlockPaste(blockJson);
			return;
		}

		if (this.handleFilePaste(clipboardData)) return;

		const plainText: string = clipboardData.getData('text/plain');

		// Paste interceptors (plugins can claim the paste before default handling)
		const html: string = clipboardData.getData('text/html');
		if (plainText && this.tryPasteInterceptors(plainText, html)) {
			return;
		}

		// Markdown branch (D11): after the synchronous interceptor loop, only when
		// there is no usable HTML (the pipeline prefers HTML), ahead of the
		// plain-text fallback, and only on a positive cheap synchronous detection.
		// Clipboard strings are captured before any `await`; `preventDefault()` has
		// already run, so the async tail (import, parse, dispatch) is safe.
		if (
			plainText &&
			this.pasteMarkdown !== 'never' &&
			!hasUsableHtml(html) &&
			looksLikeMarkdown(plainText)
		) {
			void this.handleMarkdownPaste(plainText);
			return;
		}

		this.htmlHandler.handleHTMLOrTextPaste(clipboardData, plainText);
	}

	/**
	 * Dynamically imports the Markdown engine, parses the captured text, and
	 * routes the result through the HTML paste pipeline (which owns block
	 * splicing at the caret). Only the heavy parser is lazy-loaded; the detector
	 * stayed synchronous in the base bundle.
	 *
	 * `preventDefault()` has already run, so the clipboard would be lost if the
	 * lazy import, parse, or serialize fails (offline split chunk, strict CSP, a
	 * parser throw). The whole conversion is guarded; on any failure it degrades
	 * to a plain-text insertion of the already-captured text. Only the conversion
	 * is inside the `try` — a throw from the committed paste must not double-fire
	 * the fallback.
	 */
	private async handleMarkdownPaste(text: string): Promise<void> {
		let html: string;
		try {
			const { parseMarkdownToDocument } = await import('../serialization/MarkdownParser.js');
			const doc = parseMarkdownToDocument(text, this.schemaRegistry, {
				syntaxExtensions: this.getMarkdownSyntaxExtensions(),
			});
			// Fresh ids for pasted content (no identity to preserve from the clipboard).
			html = serializeDocumentToHTML(doc, this.schemaRegistry, { includeBlockIds: false });
		} catch {
			this.htmlHandler.pastePlainText(text);
			return;
		}
		// `pasteHTMLString` dispatches synchronously, so the state-change handler has
		// already cleared the live region by the time we announce; announcing here
		// (not before the paste) ensures the import message is the surviving text.
		this.htmlHandler.pasteHTMLString(html);
		this.announce?.(this.markdownImportedMessage);
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

	destroy(): void {
		this.element.removeEventListener('paste', this.handlePaste);
	}
}
