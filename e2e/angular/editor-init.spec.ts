import { expect, test } from '../fixtures/angular-editor-page';

test.describe('Angular — Editor Initialization', () => {
	test('editor renders inside Angular component', async ({ editor }) => {
		await expect(editor.root).toBeVisible();
		await expect(editor.content).toBeVisible();
	});

	test('toolbar is visible with plugin buttons', async ({ editor }) => {
		await expect(editor.toolbar()).toBeVisible();
		await expect(editor.markButton('bold')).toBeVisible();
		await expect(editor.markButton('italic')).toBeVisible();
		await expect(editor.markButton('underline')).toBeVisible();
	});

	test('content area is editable', async ({ editor }) => {
		await expect(editor.content).toHaveAttribute('contenteditable', 'true');
	});

	test('ready event fires and output updates', async ({ editor }) => {
		const output = await editor.getOutputText();
		expect(output).toContain('Editor ready!');
	});

	test('placeholder is displayed in empty editor', async ({ editor }) => {
		const placeholder = editor.root.locator('[data-placeholder="Start typing..."]');
		await expect(placeholder).toBeVisible();
	});
});
