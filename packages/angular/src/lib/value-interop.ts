import type { Document } from '@notectl/core';

import type { ContentFormat } from './tokens';
import type { NotectlValue } from './types';

interface EditorContentApi {
	getContentHTML(): Promise<string>;
	getJSON(): Document;
	getText(): string;
	setContentHTML(html: string): Promise<void>;
	setJSON(doc: Document): void;
	setText(value: string): void;
}

const EMPTY_HTML = '<p></p>';

function isDocumentValue(value: NotectlValue): value is Document {
	return typeof value === 'object' && value !== null;
}

export async function readEditorValue(
	editor: EditorContentApi,
	format: ContentFormat,
): Promise<NotectlValue> {
	switch (format) {
		case 'html':
			return editor.getContentHTML();
		case 'text':
			return editor.getText();
		default:
			return editor.getJSON();
	}
}

export async function writeEditorValue(
	editor: EditorContentApi,
	format: ContentFormat,
	value: NotectlValue,
): Promise<void> {
	if (value === null || value === '') {
		await editor.setContentHTML(EMPTY_HTML);
		return;
	}

	if (format === 'json' && isDocumentValue(value)) {
		editor.setJSON(value);
		return;
	}

	if (format === 'text' && typeof value === 'string') {
		// Routing through `setText` (rather than `setContentHTML('<p>${escaped}</p>')`)
		// preserves block identity and multi-paragraph structure across signal-form
		// round-trips, fixing the cursor reset reported in #103 for `contentFormat: 'text'`.
		editor.setText(value);
		return;
	}

	if (typeof value === 'string') {
		await editor.setContentHTML(value);
		return;
	}

	editor.setJSON(value);
}
