import { expect, test } from './fixtures/editor-page';

test.describe('Highlight', () => {
	test('clicking swatch applies highlight', async ({ editor, page }) => {
		await editor.typeText('Highlight me');
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('highlight').click();

		const picker = page.locator('notectl-editor .notectl-color-picker');
		await picker.waitFor({ state: 'visible' });

		const swatch = picker.locator('.notectl-color-picker__swatch').first();
		await swatch.click();

		const html = await editor.getContentHTML();
		expect(html).toContain('background-color');
	});

	test('remove highlight via None button', async ({ editor, page }) => {
		// Apply highlight first
		await editor.typeText('Remove color');
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('highlight').click();
		const picker = page.locator('notectl-editor .notectl-color-picker');
		await picker.waitFor({ state: 'visible' });
		const swatch = picker.locator('.notectl-color-picker__swatch').first();
		await swatch.click();

		let html = await editor.getContentHTML();
		expect(html).toContain('background-color');

		// Refocus editor, reselect, then open picker again
		await editor.focus();
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('highlight').click();
		const picker2 = page.locator('notectl-editor .notectl-color-picker');
		await picker2.waitFor({ state: 'visible' });
		const noneBtn = picker2.locator('.notectl-color-picker__default');
		await noneBtn.click();

		html = await editor.getContentHTML();
		expect(html).not.toContain('background-color');
	});

	test('highlight mark appears in JSON', async ({ editor, page }) => {
		await editor.typeText('JSON check');
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('highlight').click();
		const picker = page.locator('notectl-editor .notectl-color-picker');
		await picker.waitFor({ state: 'visible' });
		const swatch = picker.locator('.notectl-color-picker__swatch').first();
		await swatch.click();

		type JsonBlock = {
			type: string;
			children: { text?: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }[];
		};
		const json: { children: JsonBlock[] } = await editor.getJSON();
		const firstBlock = json.children[0];
		const hasHighlight = firstBlock?.children.some((c) =>
			c.marks?.some((m) => m.type === 'highlight'),
		);
		expect(hasHighlight).toBe(true);
	});

	test('undo removes highlight', async ({ editor, page }) => {
		await editor.typeText('Undo highlight');
		await editor.waitForUndoGroup();
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		await editor.markButton('highlight').click();
		const picker = page.locator('notectl-editor .notectl-color-picker');
		await picker.waitFor({ state: 'visible' });
		const swatch = picker.locator('.notectl-color-picker__swatch').first();
		await swatch.click();

		let html = await editor.getContentHTML();
		expect(html).toContain('background-color');

		// Refocus editor before undo — multiple undos needed as highlight
		// may create separate transactions for color selection and mark application
		await editor.focus();
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('Control+z');
		}

		html = await editor.getContentHTML();
		expect(html).not.toContain('background-color');
	});
});
