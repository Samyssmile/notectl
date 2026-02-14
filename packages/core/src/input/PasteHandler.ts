/**
 * Paste handler: intercepts paste events and converts clipboard content to transactions.
 * Supports file paste via registered FileHandlers, plain text, and HTML.
 */

import DOMPurify from 'dompurify';
import { insertTextCommand } from '../commands/Commands.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { DispatchFn, GetStateFn } from './InputHandler.js';

export interface PasteHandlerOptions {
	getState: GetStateFn;
	dispatch: DispatchFn;
	schemaRegistry?: SchemaRegistry;
}

export class PasteHandler {
	private readonly getState: GetStateFn;
	private readonly dispatch: DispatchFn;
	private readonly schemaRegistry?: SchemaRegistry;
	private readonly handlePaste: (e: ClipboardEvent) => void;

	constructor(
		private readonly element: HTMLElement,
		options: PasteHandlerOptions,
	) {
		this.getState = options.getState;
		this.dispatch = options.dispatch;
		this.schemaRegistry = options.schemaRegistry;

		this.handlePaste = this.onPaste.bind(this);
		element.addEventListener('paste', this.handlePaste);
	}

	private onPaste(e: ClipboardEvent): void {
		e.preventDefault();

		const clipboardData = e.clipboardData;
		if (!clipboardData) return;

		// Check for file paste first
		if (this.handleFilePaste(clipboardData)) return;

		const state = this.getState();

		// Try HTML first, fall back to plain text
		const html = clipboardData.getData('text/html');
		if (html) {
			const allowedTags: string[] = this.schemaRegistry
				? this.schemaRegistry.getAllowedTags()
				: ['strong', 'em', 'u', 'b', 'i', 'p', 'br', 'div', 'span'];
			const allowedAttrs: string[] = this.schemaRegistry
				? this.schemaRegistry.getAllowedAttrs()
				: [];
			const sanitized = DOMPurify.sanitize(html, {
				ALLOWED_TAGS: allowedTags,
				ALLOWED_ATTR: allowedAttrs,
			});

			// TODO: Rich-text paste not yet supported — extract plain text for now
			const text = this.extractTextFromHTML(sanitized);
			if (text) {
				const tr = insertTextCommand(state, text, 'paste');
				this.dispatch(tr);
			}
			return;
		}

		const text = clipboardData.getData('text/plain');
		if (text) {
			const tr = insertTextCommand(state, text, 'paste');
			this.dispatch(tr);
		}
	}

	/** Checks for files in clipboard data and delegates to registered handlers. */
	private handleFilePaste(clipboardData: DataTransfer): boolean {
		if (!this.schemaRegistry) return false;

		// Check clipboardData.files first
		const files: File[] = Array.from(clipboardData.files);

		// Also check items for file entries (some browsers use items instead)
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

		for (const file of files) {
			const handlers = this.schemaRegistry.matchFileHandlers(file.type);
			for (const handler of handlers) {
				const result = handler(files, null);
				if (result === true) return true;
				// If handler returns a Promise, treat as handled
				if (result instanceof Promise) {
					// Fire-and-forget for async handlers
					return true;
				}
			}
		}

		return false;
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
