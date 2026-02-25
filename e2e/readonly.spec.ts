import { expect, test } from './fixtures/editor-page';
import { hasTableBlock } from './fixtures/table-utils';

test.describe('Readonly Mode', () => {
	test.beforeEach(async ({ editor }) => {
		// Ensure editor starts in editable mode
		await editor.configure({ readonly: false });
		await editor.focus();
	});

	test('toolbar is hidden when readonly is enabled', async ({ editor }) => {
		await expect(editor.toolbar()).toBeVisible();

		await editor.configure({ readonly: true });

		await expect(editor.toolbar()).toBeHidden();
	});

	test('toolbar reappears when readonly is disabled', async ({ editor }) => {
		await editor.configure({ readonly: true });
		await expect(editor.toolbar()).toBeHidden();

		await editor.configure({ readonly: false });
		await expect(editor.toolbar()).toBeVisible();
	});

	test('contentEditable is false in readonly mode', async ({ editor }) => {
		await editor.configure({ readonly: true });

		await expect(editor.content).toHaveAttribute('contenteditable', 'false');
	});

	test('aria-readonly is set in readonly mode', async ({ editor }) => {
		await editor.configure({ readonly: true });

		await expect(editor.content).toHaveAttribute('aria-readonly', 'true');
	});

	test('typing does not change content in readonly mode', async ({ editor, page }) => {
		await editor.typeText('Initial content');
		const textBefore: string = await editor.getText();

		await editor.configure({ readonly: true });
		await editor.content.click({ force: true });
		await page.keyboard.type('Should not appear', { delay: 10 });

		const textAfter: string = await editor.getText();
		expect(textAfter.trim()).toBe(textBefore.trim());
	});

	test('insertTable command does not insert a table in readonly mode', async ({ editor, page }) => {
		await editor.typeText('Some text');
		const jsonBefore = await editor.getJSON();

		await editor.configure({ readonly: true });

		const inserted: boolean = await page.evaluate(() => {
			type EditorEl = HTMLElement & { executeCommand(name: string): boolean };
			const el = document.querySelector('notectl-editor') as EditorEl | null;
			if (!el) return false;
			return el.executeCommand('insertTable');
		});

		const hasTable: boolean = await hasTableBlock(page);
		const jsonAfter = await editor.getJSON();

		// Either the command returns false, or no table was actually added
		expect(hasTable).toBe(false);
		expect(jsonAfter.children.length).toBe(jsonBefore.children.length);
	});

	test('keyboard shortcut Ctrl+B does not toggle bold in readonly mode', async ({
		editor,
		page,
	}) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');
		// Text should be bold now
		const htmlBefore: string = await editor.getHTML();
		expect(htmlBefore).toContain('<strong>');

		await editor.configure({ readonly: true });

		// Try to remove bold via shortcut
		await editor.content.click({ force: true });
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');

		const htmlAfter: string = await editor.getHTML();
		// Bold should still be present
		expect(htmlAfter).toContain('<strong>');
	});

	test('paste does not change content in readonly mode', async ({ editor }) => {
		await editor.typeText('Original');
		const textBefore: string = await editor.getText();

		await editor.configure({ readonly: true });

		await editor.pasteText('Pasted content');

		const textAfter: string = await editor.getText();
		expect(textAfter.trim()).toBe(textBefore.trim());
	});

	test('Enter key does not create new blocks in readonly mode', async ({ editor, page }) => {
		await editor.typeText('Single block');
		const jsonBefore = await editor.getJSON();

		await editor.configure({ readonly: true });
		await editor.content.click({ force: true });
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');

		const jsonAfter = await editor.getJSON();
		expect(jsonAfter.children.length).toBe(jsonBefore.children.length);
	});

	test('editing resumes after disabling readonly', async ({ editor, page }) => {
		await editor.typeText('Before');

		await editor.configure({ readonly: true });
		await editor.content.click({ force: true });
		await page.keyboard.type(' blocked', { delay: 10 });

		// Text should be unchanged after readonly input attempts
		const textWhileReadonly: string = await editor.getText();
		expect(textWhileReadonly.trim()).toBe('Before');

		await editor.configure({ readonly: false });
		await editor.typeText(' after');

		const text: string = await editor.getText();
		expect(text).toContain('Before');
		expect(text).toContain('after');
	});
});
