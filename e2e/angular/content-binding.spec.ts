import { expect, test } from '../fixtures/angular-editor-page';

test.describe('Angular — Content Binding & API Proxy', () => {
	test('Set JSON button loads content via Angular wrapper', async ({ editor }) => {
		await editor.controlButton('Set JSON').click();

		const text: string = await editor.getText();
		expect(text).toContain('Content set via setJSON');
	});

	test('setJSON via Web Component API loads content', async ({ editor }) => {
		await editor.setJSON({
			children: [
				{
					id: 'wc-1',
					type: 'paragraph',
					children: [{ type: 'text', text: 'Direct WC setJSON', marks: [] }],
				},
			],
		});

		const text: string = await editor.getText();
		expect(text).toContain('Direct WC setJSON');
	});

	test('getJSON/setJSON round-trip preserves content', async ({ editor }) => {
		await editor.typeText('Round trip test');

		const json = await editor.getJSON();
		expect(json.children).toHaveLength(1);
		expect(json.children[0].type).toBe('paragraph');

		// Clear and reload via setJSON
		await editor.setJSON({
			children: [
				{
					id: 'clear',
					type: 'paragraph',
					children: [{ type: 'text', text: '', marks: [] }],
				},
			],
		});
		await editor.setJSON(json);

		const text: string = await editor.getText();
		expect(text).toContain('Round trip test');
	});

	test('setJSON followed by typing increments stateChange counter', async ({ editor }) => {
		await editor.controlButton('Set JSON').click();

		const before: number = await editor.getStateChangeCount();
		await editor.focus();
		await editor.page.keyboard.type(' extra', { delay: 10 });

		const after: number = await editor.getStateChangeCount();
		expect(after).toBeGreaterThan(before);
	});

	test('Set JSON output message confirms action', async ({ editor }) => {
		await editor.controlButton('Set JSON').click();

		await expect(editor.output).toContainText('Content set via setJSON');
	});
});
