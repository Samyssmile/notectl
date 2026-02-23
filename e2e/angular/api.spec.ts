import { expect, test } from '../fixtures/angular-editor-page';

test.describe('Angular — API via Buttons', () => {
	test('Get JSON displays document structure', async ({ editor }) => {
		await editor.typeText('Hello');
		await editor.controlButton('Get JSON').click();

		const output = await editor.getOutputText();
		expect(output).toContain('"type"');
		expect(output).toContain('paragraph');
		expect(output).toContain('Hello');
	});

	test('Get HTML displays HTML markup', async ({ editor }) => {
		await editor.typeText('Hello');
		await editor.controlButton('Get HTML').click();

		const output = await editor.getOutputText();
		expect(output).toContain('<p>');
		expect(output).toContain('Hello');
	});

	test('Get Text displays plain text', async ({ editor }) => {
		await editor.typeText('Hello');
		await editor.controlButton('Get Text').click();

		const output = await editor.getOutputText();
		expect(output.trim()).toBe('Hello');
	});

	test('Is Empty returns false after typing', async ({ editor }) => {
		await editor.typeText('Hi');
		await editor.controlButton('Is Empty?').click();
		await expect(editor.output).toContainText('false');
	});

	test('Is Empty button is functional', async ({ editor }) => {
		await editor.controlButton('Is Empty?').click();
		await expect(editor.output).toContainText('isEmpty:');
	});

	test('Toggle Bold via API button', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');
		await editor.controlButton('API: Toggle Bold').click();

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
	});

	test('Undo via API button', async ({ editor }) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await editor.controlButton('API: Undo').click();

		const text = await editor.getText();
		expect(text.trim()).toBe('');
	});

	test('Redo via API button', async ({ editor }) => {
		await editor.typeText('Hello');
		await editor.waitForUndoGroup();
		await editor.controlButton('API: Undo').click();

		let text = await editor.getText();
		expect(text.trim()).toBe('');

		await editor.controlButton('API: Redo').click();

		text = await editor.getText();
		expect(text.trim()).toBe('Hello');
	});

	test('getJSON returns valid document via Web Component API', async ({ editor }) => {
		await editor.typeText('Test');
		const json = await editor.getJSON();
		expect(json.children).toHaveLength(1);
		expect(json.children[0].type).toBe('paragraph');
	});

	test('getHTML returns markup via Web Component API', async ({ editor }) => {
		await editor.typeText('Test');
		const html = await editor.getHTML();
		expect(html).toContain('<p>');
		expect(html).toContain('Test');
	});

	test('setHTML loads content via Web Component API', async ({ editor }) => {
		await editor.setHTML('<p><strong>Bold</strong> text</p>');

		const text = await editor.getText();
		expect(text).toContain('Bold');
		expect(text).toContain('text');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
	});
});
