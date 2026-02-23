import { expect, test } from '../fixtures/angular-editor-page';

test.describe('Angular — Readonly Mode', () => {
	test('toggle readonly sets contenteditable to false', async ({ editor }) => {
		await editor.controlButton('Toggle Readonly').click();

		await expect(editor.content).toHaveAttribute('contenteditable', 'false');
	});

	test('typing does not change content in readonly mode', async ({ editor, page }) => {
		await editor.typeText('Before');
		const textBefore: string = await editor.getText();

		await editor.controlButton('Toggle Readonly').click();
		await editor.content.click({ force: true });
		await page.keyboard.type('After', { delay: 10 });

		const textAfter: string = await editor.getText();
		expect(textAfter.trim()).toBe(textBefore.trim());
	});

	test('toggle back restores editability', async ({ editor }) => {
		await editor.controlButton('Toggle Readonly').click();
		await expect(editor.content).toHaveAttribute('contenteditable', 'false');

		await editor.controlButton('Toggle Readonly').click();
		await expect(editor.content).toHaveAttribute('contenteditable', 'true');
	});

	test('output shows readonly status', async ({ editor }) => {
		await editor.controlButton('Toggle Readonly').click();
		await expect(editor.output).toContainText('Readonly: true');

		await editor.controlButton('Toggle Readonly').click();
		await expect(editor.output).toContainText('Readonly: false');
	});
});
