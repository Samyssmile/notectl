import { expect, test } from '../fixtures/angular-editor-page';

test.describe('Angular — Event Bridge', () => {
	test('stateChange fires on typing and increments counter', async ({ editor, page }) => {
		const before: number = await editor.getStateChangeCount();
		await editor.typeText('Hi');
		const after: number = await editor.getStateChangeCount();

		expect(after).toBeGreaterThan(before);
	});

	test('editorFocus event fires on focus', async ({ editor }) => {
		// Click outside first to ensure editor is not focused
		await editor.page.locator('h1').click();
		await editor.page.waitForTimeout(100);

		await editor.content.click();
		await expect(editor.testIndicators()).toHaveAttribute('data-last-event', 'focus');
	});

	test('editorBlur event fires on blur', async ({ editor }) => {
		await editor.focus();
		await editor.page.waitForTimeout(100);

		// Click outside to blur
		await editor.page.locator('h1').click();
		await expect(editor.testIndicators()).toHaveAttribute('data-last-event', 'blur');
	});

	test('selectionChange fires on cursor movement', async ({ editor, page }) => {
		await editor.typeText('Hello World');
		// Reset lastEvent by focusing elsewhere
		await editor.page.locator('h1').click();
		await editor.page.waitForTimeout(100);

		await editor.content.click();
		await editor.page.waitForTimeout(100);
		await page.keyboard.press('ArrowLeft');

		await expect(editor.testIndicators()).toHaveAttribute('data-last-event', 'selectionChange');
	});

	test('stateChange counter accumulates across multiple edits', async ({ editor }) => {
		await editor.typeText('A');
		const first: number = await editor.getStateChangeCount();

		await editor.typeText('B');
		const second: number = await editor.getStateChangeCount();

		expect(second).toBeGreaterThan(first);
	});
});
