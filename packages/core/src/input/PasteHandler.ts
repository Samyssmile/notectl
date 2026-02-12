/**
 * Paste handler: intercepts paste events and converts clipboard content to transactions.
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
	private readonly handlePaste: (e: ClipboardEvent) => void;

	constructor(
		private readonly element: HTMLElement,
		options: PasteHandlerOptions,
	) {
		this.getState = options.getState;
		this.dispatch = options.dispatch;

		this.handlePaste = this.onPaste.bind(this);
		element.addEventListener('paste', this.handlePaste);
	}

	private onPaste(e: ClipboardEvent): void {
		e.preventDefault();

		const clipboardData = e.clipboardData;
		if (!clipboardData) return;

		const state = this.getState();

		// Try HTML first, fall back to plain text
		const html = clipboardData.getData('text/html');
		if (html) {
			const sanitized = DOMPurify.sanitize(html, {
				ALLOWED_TAGS: ['strong', 'em', 'u', 'b', 'i', 'p', 'br', 'div', 'span'],
				ALLOWED_ATTR: [],
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

	private extractTextFromHTML(html: string): string {
		const template = document.createElement('template');
		template.innerHTML = html;
		return template.content.textContent ?? '';
	}

	destroy(): void {
		this.element.removeEventListener('paste', this.handlePaste);
	}
}
