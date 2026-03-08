/**
 * Paste handler: intercepts paste events and routes clipboard content
 * to specialized handlers for HTML, rich blocks, files, and plain text.
 */

import type { FileHandlerRegistry } from '../model/FileHandlerRegistry.js';
import type { PasteInterceptorEntry } from '../model/PasteInterceptor.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';
import { PasteHTMLHandler } from './PasteHTMLHandler.js';
import { PasteRichBlockHandler } from './PasteRichBlockHandler.js';

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
	private readonly fileHandlerRegistry?: FileHandlerRegistry;
	private readonly isReadOnly: () => boolean;
	private readonly getPasteInterceptors: () => readonly PasteInterceptorEntry[];
	private readonly handlePaste: (e: ClipboardEvent) => void;
	private readonly htmlHandler: PasteHTMLHandler;
	private readonly richBlockHandler: PasteRichBlockHandler;

	constructor(
		private readonly element: HTMLElement,
		options: PasteHandlerOptions,
	) {
		this.getState = options.getState;
		this.dispatch = options.dispatch;
		this.fileHandlerRegistry = options.fileHandlerRegistry;
		this.isReadOnly = options.isReadOnly ?? (() => false);
		this.getPasteInterceptors = options.getPasteInterceptors ?? (() => []);

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

		this.htmlHandler.handleHTMLOrTextPaste(clipboardData, plainText);
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
