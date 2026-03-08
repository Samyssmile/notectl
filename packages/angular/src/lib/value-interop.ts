import type { Document } from '@notectl/core';

import type { ContentFormat } from './tokens';
import type { NotectlValue } from './types';

interface EditorContentApi {
	getContentHTML(): Promise<string>;
	getJSON(): Document;
	getText(): string;
	setContentHTML(html: string): Promise<void>;
	setJSON(doc: Document): void;
}

const EMPTY_HTML = '<p></p>';

/** Escapes HTML special characters before inserting plain text. */
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

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
		await editor.setContentHTML(`<p>${escapeHtml(value)}</p>`);
		return;
	}

	if (typeof value === 'string') {
		await editor.setContentHTML(value);
		return;
	}

	editor.setJSON(value);
}
