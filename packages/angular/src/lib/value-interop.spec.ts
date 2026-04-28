import { describe, expect, it, vi } from 'vitest';

import type { Document } from '@notectl/core';

import { readEditorValue, writeEditorValue } from './value-interop.js';

const DOC: Document = {
	children: [
		{
			id: 'p1' as never,
			type: 'paragraph' as never,
			children: [{ type: 'text', text: 'Hello', marks: [] }],
		},
	],
};

function createEditorApi() {
	return {
		getContentHTML: vi.fn(async () => '<p>Hello</p>'),
		getJSON: vi.fn(() => DOC),
		getText: vi.fn(() => 'Hello'),
		setContentHTML: vi.fn(async () => undefined),
		setJSON: vi.fn(() => undefined),
		setText: vi.fn(() => undefined),
	};
}

describe('value-interop', () => {
	it('reads JSON values in json mode', async () => {
		const editor = createEditorApi();

		await expect(readEditorValue(editor, 'json')).resolves.toEqual(DOC);
		expect(editor.getJSON).toHaveBeenCalledOnce();
	});

	it('reads HTML values in html mode', async () => {
		const editor = createEditorApi();

		await expect(readEditorValue(editor, 'html')).resolves.toBe('<p>Hello</p>');
		expect(editor.getContentHTML).toHaveBeenCalledOnce();
	});

	it('reads text values in text mode', async () => {
		const editor = createEditorApi();

		await expect(readEditorValue(editor, 'text')).resolves.toBe('Hello');
		expect(editor.getText).toHaveBeenCalledOnce();
	});

	it('clears the editor for null and empty-string writes', async () => {
		const editor = createEditorApi();

		await writeEditorValue(editor, 'json', null);
		await writeEditorValue(editor, 'html', '');

		expect(editor.setContentHTML).toHaveBeenNthCalledWith(1, '<p></p>');
		expect(editor.setContentHTML).toHaveBeenNthCalledWith(2, '<p></p>');
	});

	it('writes documents through setJSON in json mode', async () => {
		const editor = createEditorApi();

		await writeEditorValue(editor, 'json', DOC);

		expect(editor.setJSON).toHaveBeenCalledWith(DOC);
		expect(editor.setContentHTML).not.toHaveBeenCalled();
	});

	it('writes plain-text values via setText to preserve block identity across round-trips', async () => {
		const editor = createEditorApi();

		await writeEditorValue(editor, 'text', '<script>alert(1)</script>');

		expect(editor.setText).toHaveBeenCalledWith('<script>alert(1)</script>');
		expect(editor.setContentHTML).not.toHaveBeenCalled();
	});

	it('preserves multiline text without collapsing into a single paragraph', async () => {
		const editor = createEditorApi();

		await writeEditorValue(editor, 'text', 'first\nsecond');

		expect(editor.setText).toHaveBeenCalledWith('first\nsecond');
	});
});
