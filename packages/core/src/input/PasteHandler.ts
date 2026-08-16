/**
 * Paste handler: intercepts paste events and routes clipboard content
 * to specialized handlers for HTML, rich blocks, files, and plain text.
 */

import {
	type FileHandlerDispatchOutcome,
	dispatchFilesToHandlers,
} from '../model/FileHandlerDispatcher.js';
import type { FileHandlerRegistry } from '../model/FileHandlerRegistry.js';
import type { MarkdownSyntaxExtension } from '../model/MarkdownSyntaxRegistry.js';
import type { PasteInterceptorEntry } from '../model/PasteInterceptor.js';
import { PluginCallbackExecutor } from '../model/PluginCallbackExecutor.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	type EditorSelection,
	isGapCursor,
	isNodeSelection,
	isTextSelection,
	selectionsEqual,
} from '../model/Selection.js';
import { isEventFromEditorContent } from '../platform/EditorEventBoundary.js';
import { serializeDocumentToHTML } from '../serialization/DocumentSerializer.js';
import type { EditorState } from '../state/EditorState.js';
import { mapSelection } from '../state/SelectionMapping.js';
import type { Transaction } from '../state/Transaction.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';
import { looksLikeMarkdown } from './MarkdownPasteDetector.js';
import { PasteHTMLHandler } from './PasteHTMLHandler.js';
import { PasteRichBlockHandler } from './PasteRichBlockHandler.js';

/** Markdown auto-detection mode for the paste pipeline. */
export type PasteMarkdownMode = 'auto' | 'never';

type MarkdownParserModule = Pick<
	typeof import('../serialization/MarkdownParser.js'),
	'parseMarkdownToDocument'
>;

interface ClipboardSnapshot {
	readonly blockJson: string;
	readonly files: readonly File[];
	readonly plainText: string;
	readonly html: string;
}

interface PasteBookmark {
	selection: EditorSelection;
	cancelled: boolean;
}

/** Whether the clipboard `text/html` payload carries real markup worth preferring. */
function hasUsableHtml(html: string): boolean {
	return html.trim() !== '' && /<\w/.test(html);
}

const IMAGE_REPRESENTATION_SELECTOR = 'img, picture, svg, canvas';

/**
 * Whether the clipboard HTML flavor should win over the file items captured
 * next to it.
 *
 * Word and Excel on macOS put a bitmap rendition of the copied content on the
 * clipboard alongside the HTML flavor, and Chromium exposes that bitmap as a
 * file item. Dispatching the files first would paste a screenshot of the
 * copied text instead of the text itself (#216), so usable HTML takes
 * precedence. Markup that is nothing but an image representation is the
 * exception: copying an image on a web page can also ship HTML next to the
 * image file, and those pastes stay with the file handlers so blob URLs and
 * upload services keep working.
 *
 * Precedence is an ordering, not a verdict: when the preferred HTML turns out
 * to paste nothing, the skipped files are dispatched after all (see
 * `dispatchDeferredFiles`) so the clipboard is never silently discarded.
 */
function htmlTakesPrecedenceOverFiles(html: string, files: readonly File[]): boolean {
	// Only image files can be alternate renderings of copied rich content. Other
	// MIME types belong to their registered handlers even when the clipboard also
	// exposes an HTML preview.
	if (files.length === 0 || files.some((file) => !file.type.startsWith('image/'))) return false;
	if (!hasUsableHtml(html)) return false;
	// Parse into a detached document that is inspected here and never inserted
	// into the live page.
	const body: HTMLElement = new DOMParser().parseFromString(html, 'text/html').body;
	const imageRepresentations: NodeListOf<Element> = body.querySelectorAll(
		IMAGE_REPRESENTATION_SELECTOR,
	);
	const hasImageRepresentation: boolean = imageRepresentations.length > 0;
	for (const image of imageRepresentations) {
		image.remove();
	}
	if ((body.textContent ?? '').trim() !== '') return true;
	return !hasImageRepresentation;
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
	/** Shared plugin callback error boundary supplied by PluginManager. */
	readonly callbackExecutor?: PluginCallbackExecutor;
	/** Testable lazy-loader seam; production defaults to the Markdown split chunk. */
	readonly loadMarkdownParser?: () => Promise<MarkdownParserModule>;
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
	private readonly callbackExecutor: PluginCallbackExecutor;
	private readonly loadMarkdownParser: () => Promise<MarkdownParserModule>;
	private readonly handlePaste: (e: ClipboardEvent) => void;
	private readonly htmlHandler: PasteHTMLHandler;
	private readonly richBlockHandler: PasteRichBlockHandler;
	private readonly pendingBookmarks = new Set<PasteBookmark>();
	private active = true;

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
		this.callbackExecutor = options.callbackExecutor ?? PluginCallbackExecutor.silent;
		this.loadMarkdownParser =
			options.loadMarkdownParser ?? (() => import('../serialization/MarkdownParser.js'));

		this.richBlockHandler = new PasteRichBlockHandler(
			options.getState,
			(tr: Transaction) => this.dispatchPasteTransaction(tr),
			options.schemaRegistry,
		);
		this.htmlHandler = new PasteHTMLHandler(
			options.getState,
			(tr: Transaction) => this.dispatchPasteTransaction(tr),
			options.schemaRegistry,
			(json: string, state?: EditorState) =>
				this.richBlockHandler.handleRichPasteFromJson(json, state),
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
		const snapshot = this.captureClipboard(clipboardData);

		if (snapshot.blockJson) {
			this.richBlockHandler.handleBlockPaste(snapshot.blockJson);
			return;
		}

		const bookmark = this.createBookmark();
		const htmlPreferred: boolean = htmlTakesPrecedenceOverFiles(snapshot.html, snapshot.files);
		const fileOutcome: FileHandlerDispatchOutcome | Promise<FileHandlerDispatchOutcome> =
			this.fileHandlerRegistry && snapshot.files.length > 0 && !htmlPreferred
				? dispatchFilesToHandlers({
						registry: this.fileHandlerRegistry,
						executor: this.callbackExecutor,
						files: snapshot.files,
						getPosition: () => null,
						isActive: () => this.isBookmarkActive(bookmark),
					})
				: { handled: false, cancelled: false };
		if (fileOutcome instanceof Promise) {
			void this.continueAfterFileHandlers(fileOutcome, snapshot, bookmark);
			return;
		}
		if (fileOutcome.handled || fileOutcome.cancelled) {
			this.releaseBookmark(bookmark);
			return;
		}
		this.processClipboardSnapshot(snapshot, bookmark, htmlPreferred ? snapshot.files : []);
	}

	private processClipboardSnapshot(
		snapshot: ClipboardSnapshot,
		bookmark: PasteBookmark,
		deferredFiles: readonly File[],
	): void {
		if (!this.isBookmarkActive(bookmark)) {
			this.releaseBookmark(bookmark);
			return;
		}

		// Paste interceptors (plugins can claim the paste before default handling)
		if (
			snapshot.plainText &&
			this.tryPasteInterceptors(snapshot.plainText, snapshot.html, bookmark)
		) {
			return;
		}

		// Markdown branch (D11): after the synchronous interceptor loop, only when
		// there is no usable HTML (the pipeline prefers HTML), ahead of the
		// plain-text fallback, and only on a positive cheap synchronous detection.
		// Clipboard strings are captured before any `await`; `preventDefault()` has
		// already run, so the async tail (import, parse, dispatch) is safe.
		if (
			snapshot.plainText &&
			this.pasteMarkdown !== 'never' &&
			!hasUsableHtml(snapshot.html) &&
			looksLikeMarkdown(snapshot.plainText)
		) {
			void this.handleMarkdownPaste(snapshot.plainText, bookmark);
			return;
		}

		const target = this.consumeBookmark(bookmark);
		if (!target) return;
		if (snapshot.html) {
			if (!this.htmlHandler.pasteHTMLString(snapshot.html, target)) {
				this.handleContentlessHTMLFallback(deferredFiles, snapshot.plainText, target);
			}
		} else if (snapshot.plainText) {
			this.htmlHandler.pastePlainText(snapshot.plainText, target);
		}
	}

	/**
	 * Continues through the remaining clipboard flavors after preferred HTML
	 * materialized nothing (#216). Deferred image files get the next turn; when
	 * none is handled, the captured plain text is the final lossless fallback.
	 */
	private handleContentlessHTMLFallback(
		files: readonly File[],
		plainText: string,
		target: EditorSelection,
	): void {
		const registry: FileHandlerRegistry | undefined = this.fileHandlerRegistry;
		if (!registry || files.length === 0) {
			if (this.active && !this.isReadOnly() && plainText) {
				this.htmlHandler.pastePlainText(plainText, target);
			}
			return;
		}

		const bookmark: PasteBookmark = this.createBookmark(target);
		const outcome: FileHandlerDispatchOutcome | Promise<FileHandlerDispatchOutcome> =
			dispatchFilesToHandlers({
				registry,
				executor: this.callbackExecutor,
				files,
				getPosition: () => null,
				isActive: () => this.isBookmarkActive(bookmark),
			});
		if (!(outcome instanceof Promise)) {
			this.finishContentlessHTMLFallback(outcome, plainText, bookmark);
			return;
		}
		void this.continueContentlessHTMLFallback(outcome, plainText, bookmark);
	}

	private async continueContentlessHTMLFallback(
		pending: Promise<FileHandlerDispatchOutcome>,
		plainText: string,
		bookmark: PasteBookmark,
	): Promise<void> {
		try {
			this.finishContentlessHTMLFallback(await pending, plainText, bookmark);
		} catch (cause) {
			// The shared dispatcher catches plugin failures; this boundary protects
			// the fire-and-forget tail against an invariant failure of its own.
			this.callbackExecutor.reportFailure(
				{ pluginId: 'core', name: 'Deferred file paste', kind: 'file-handler' },
				cause,
			);
			this.releaseBookmark(bookmark);
		}
	}

	private finishContentlessHTMLFallback(
		outcome: FileHandlerDispatchOutcome,
		plainText: string,
		bookmark: PasteBookmark,
	): void {
		if (outcome.handled || outcome.cancelled || !this.isBookmarkActive(bookmark)) {
			this.releaseBookmark(bookmark);
			return;
		}

		const target = this.consumeBookmark(bookmark);
		if (target && plainText) this.htmlHandler.pastePlainText(plainText, target);
	}

	/**
	 * Dynamically imports the Markdown engine, parses the captured text, and
	 * routes the result through the HTML paste pipeline (which owns block
	 * splicing at the caret). Only the heavy parser is lazy-loaded; the detector
	 * stayed synchronous in the base bundle.
	 *
	 * `preventDefault()` has already run, so the clipboard would be lost if the
	 * lazy import, parse, or serialize fails (offline split chunk, strict CSP, a
	 * parser throw). Conversion failure degrades to a plain-text insertion of the
	 * captured text. Conversion, commit, fallback, and announcement each cross the
	 * shared runtime boundary, so this fire-and-forget async tail never leaks an
	 * unhandled rejection or double-fires a fallback after a commit attempt.
	 */
	private async handleMarkdownPaste(text: string, bookmark: PasteBookmark): Promise<void> {
		const conversion = await this.callbackExecutor.executeMaybeAsync(
			{ pluginId: 'core', name: 'Markdown conversion', kind: 'markdown-paste' },
			async () => {
				const { parseMarkdownToDocument } = await this.loadMarkdownParser();
				const doc = parseMarkdownToDocument(text, this.schemaRegistry, {
					syntaxExtensions: this.getMarkdownSyntaxExtensions(),
				});
				// Fresh ids for pasted content (no identity to preserve from the clipboard).
				return serializeDocumentToHTML(doc, this.schemaRegistry, { includeBlockIds: false });
			},
		);
		if (!this.isBookmarkActive(bookmark)) {
			this.releaseBookmark(bookmark);
			return;
		}

		const target = this.consumeBookmark(bookmark);
		if (!target) return;
		if (!conversion.ok) {
			this.commitMarkdownPlainTextFallback(text, target);
			return;
		}

		const committed = this.callbackExecutor.execute(
			{ pluginId: 'core', name: 'Markdown HTML commit', kind: 'markdown-paste' },
			() => this.htmlHandler.pasteHTMLString(conversion.value, target),
		);
		// A commit that threw or materialized nothing (markdown that converts to
		// contentless HTML) falls back to the captured text; `preventDefault()`
		// already ran, so dropping it here would lose the clipboard silently.
		if (!committed.ok || !committed.value) {
			if (this.active && !this.isReadOnly()) {
				this.commitMarkdownPlainTextFallback(text, target);
			}
			return;
		}
		if (!this.active || this.isReadOnly()) return;
		// Dispatch is synchronous, so the state-change handler has cleared the live
		// region before this announcement becomes the surviving message.
		this.callbackExecutor.execute(
			{ pluginId: 'core', name: 'Markdown announcement', kind: 'markdown-paste' },
			() => this.announce?.(this.markdownImportedMessage),
		);
	}

	private commitMarkdownPlainTextFallback(text: string, target: EditorSelection): void {
		this.callbackExecutor.execute(
			{ pluginId: 'core', name: 'Markdown plain-text fallback', kind: 'markdown-paste' },
			() => this.htmlHandler.pastePlainText(text, target),
		);
	}

	/** Runs paste interceptors in priority order. Returns true if one claimed the paste. */
	private tryPasteInterceptors(plainText: string, html: string, bookmark: PasteBookmark): boolean {
		const interceptors = this.getPasteInterceptors();
		const state = this.getState().withSelection(bookmark.selection);
		for (const entry of interceptors) {
			const outcome = this.callbackExecutor.execute(
				{
					pluginId: entry.pluginId,
					name: entry.name,
					kind: 'paste-interceptor',
				},
				() => entry.interceptor(plainText, html, state),
			);
			if (outcome.ok && outcome.value) {
				this.consumeBookmark(bookmark);
				this.dispatchPasteTransaction(outcome.value);
				return true;
			}
		}
		return false;
	}

	private captureClipboard(clipboardData: DataTransfer): ClipboardSnapshot {
		const files = Array.from(clipboardData.files);
		if (files.length === 0) {
			for (let i = 0; i < clipboardData.items.length; i++) {
				const item = clipboardData.items[i];
				if (item && item.kind === 'file') {
					const file = item.getAsFile();
					if (file) files.push(file);
				}
			}
		}
		return {
			blockJson: clipboardData.getData('application/x-notectl-block'),
			files,
			plainText: clipboardData.getData('text/plain'),
			html: clipboardData.getData('text/html'),
		};
	}

	private async continueAfterFileHandlers(
		pending: Promise<FileHandlerDispatchOutcome>,
		snapshot: ClipboardSnapshot,
		bookmark: PasteBookmark,
	): Promise<void> {
		try {
			const outcome = await pending;
			if (outcome.cancelled || !this.isBookmarkActive(bookmark)) {
				this.releaseBookmark(bookmark);
				return;
			}
			if (outcome.handled) {
				this.releaseBookmark(bookmark);
				return;
			}
			// The files already had their turn in this branch, so none are deferred.
			this.processClipboardSnapshot(snapshot, bookmark, []);
		} catch (cause) {
			// The shared dispatcher catches plugin failures. This boundary protects
			// against an invariant failure in the continuation itself without leaking
			// an unhandled rejection from the event listener's `void` async tail.
			this.callbackExecutor.reportFailure(
				{ pluginId: 'core', name: 'File paste continuation', kind: 'file-handler' },
				cause,
			);
			this.releaseBookmark(bookmark);
		}
	}

	/** Maps every pending async paste target through an applied transaction. */
	onStateChange(oldState: EditorState, state: EditorState, tr: Transaction): void {
		for (const bookmark of this.pendingBookmarks) {
			if (oldState.doc !== state.doc && tr.steps.length === 0) {
				bookmark.cancelled = true;
				this.pendingBookmarks.delete(bookmark);
				continue;
			}
			const mapped = mapSelection(bookmark.selection, tr.mapping);
			if (!mapped || !selectionExistsInState(state, mapped)) {
				bookmark.cancelled = true;
				this.pendingBookmarks.delete(bookmark);
				continue;
			}
			bookmark.selection = mapped;
		}
	}

	private createBookmark(selection: EditorSelection = this.getState().selection): PasteBookmark {
		const bookmark: PasteBookmark = { selection, cancelled: false };
		this.pendingBookmarks.add(bookmark);
		return bookmark;
	}

	private consumeBookmark(bookmark: PasteBookmark): EditorSelection | null {
		if (!this.isBookmarkActive(bookmark)) {
			this.releaseBookmark(bookmark);
			return null;
		}
		this.pendingBookmarks.delete(bookmark);
		return bookmark.selection;
	}

	private releaseBookmark(bookmark: PasteBookmark): void {
		this.pendingBookmarks.delete(bookmark);
	}

	private isBookmarkActive(bookmark: PasteBookmark): boolean {
		return (
			this.active &&
			!this.isReadOnly() &&
			!bookmark.cancelled &&
			this.pendingBookmarks.has(bookmark)
		);
	}

	/**
	 * Transactions are built against the bookmarked selection but the current
	 * document. If the user moved meanwhile, keep that live selection mapped
	 * through the paste instead of snapping the caret back to the async target.
	 */
	private dispatchPasteTransaction(tr: Transaction): void {
		const liveState = this.getState();
		if (selectionsEqual(liveState.selection, tr.selectionBefore)) {
			this.dispatch(tr);
			return;
		}
		const mappedLiveSelection = mapSelection(liveState.selection, tr.mapping);
		this.dispatch({
			...tr,
			selectionBefore: liveState.selection,
			selectionAfter: mappedLiveSelection ?? tr.selectionAfter,
			storedMarksAfter: liveState.storedMarks,
		});
	}

	destroy(): void {
		if (!this.active) return;
		this.active = false;
		this.element.removeEventListener('paste', this.handlePaste);
		for (const bookmark of this.pendingBookmarks) bookmark.cancelled = true;
		this.pendingBookmarks.clear();
	}
}

function selectionExistsInState(state: EditorState, selection: EditorSelection): boolean {
	if (isNodeSelection(selection)) return state.getBlock(selection.nodeId) !== undefined;
	if (isGapCursor(selection)) return state.getBlock(selection.blockId) !== undefined;
	if (isTextSelection(selection)) {
		return (
			state.getBlock(selection.anchor.blockId) !== undefined &&
			state.getBlock(selection.head.blockId) !== undefined
		);
	}
	return false;
}
