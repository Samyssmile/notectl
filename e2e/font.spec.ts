import { expect, test } from './fixtures/editor-page';

const FONT_ITEM = '.notectl-font-picker__item';

test.describe('FontPlugin', () => {
	test('Font toolbar button is visible', async ({ editor }) => {
		const fontBtn = editor.markButton('font');
		await expect(fontBtn).toBeVisible();
	});

	test('Font popup opens and shows font list', async ({ editor }) => {
		const fontBtn = editor.markButton('font');
		await fontBtn.click();

		const popup = editor.root.locator('.notectl-font-picker');
		await expect(popup).toBeVisible();

		const items = popup.locator(FONT_ITEM);
		const count = await items.count();
		expect(count).toBeGreaterThan(0);

		// First item should be the default font (Fira Sans)
		const firstLabel = items.first().locator('.notectl-font-picker__label');
		await expect(firstLabel).toHaveText('Fira Sans');
	});

	test('Selecting a non-default font applies font-family', async ({ editor, page }) => {
		await editor.typeText('Hello World');
		await page.keyboard.press('Control+a');

		const fontBtn = editor.markButton('font');
		await fontBtn.click();

		// Select second font (Fira Code), since first is the default
		const popup = editor.root.locator('.notectl-font-picker');
		await popup.locator(FONT_ITEM).nth(1).click();

		const html = await editor.getHTML();
		expect(html).toContain('font-family');
	});

	test('Selecting default font removes font mark', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');

		const fontBtn = editor.markButton('font');

		// Apply Fira Code (non-default)
		await fontBtn.click();
		const popup = editor.root.locator('.notectl-font-picker');
		await popup.locator(FONT_ITEM).nth(1).click();

		let html = await editor.getHTML();
		expect(html).toContain('font-family');

		// Select the default font (Fira Sans) to remove the mark
		await page.keyboard.press('Control+a');
		await fontBtn.click();
		const popup2 = editor.root.locator('.notectl-font-picker');
		await popup2.locator(FONT_ITEM).first().click();

		html = await editor.getHTML();
		expect(html).not.toContain('font-family');
	});

	test('Popup closes after font selection', async ({ editor, page }) => {
		await editor.typeText('Test');
		await page.keyboard.press('Control+a');

		const fontBtn = editor.markButton('font');
		await fontBtn.click();

		const popup = editor.root.locator('.notectl-font-picker');
		await expect(popup).toBeVisible();

		await popup.locator(FONT_ITEM).nth(1).click();

		// Popup should be dismissed
		await expect(popup).not.toBeVisible();
	});

	test('Font mark persists in JSON round-trip', async ({ editor, page }) => {
		await editor.typeText('Test');
		await page.keyboard.press('Control+a');

		const fontBtn = editor.markButton('font');
		await fontBtn.click();
		const popup = editor.root.locator('.notectl-font-picker');
		await popup.locator(FONT_ITEM).nth(1).click();

		const json = await editor.getJSON();
		const marks = json.children[0]?.children[0]?.marks ?? [];
		const fontMark = marks.find((m: { type: string }) => m.type === 'font');
		expect(fontMark).toBeDefined();
		expect(fontMark.attrs?.family).toBeTruthy();
	});

	test('Font + Undo restores original text', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');

		const fontBtn = editor.markButton('font');
		await fontBtn.click();
		const popup = editor.root.locator('.notectl-font-picker');
		await popup.locator(FONT_ITEM).nth(1).click();

		let html = await editor.getHTML();
		expect(html).toContain('font-family');

		await page.keyboard.press('Control+z');
		html = await editor.getHTML();
		expect(html).not.toContain('font-family');
	});

	test('Font can be combined with bold', async ({ editor, page }) => {
		await editor.typeText('Styled');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');

		const fontBtn = editor.markButton('font');
		await fontBtn.click();
		const popup = editor.root.locator('.notectl-font-picker');
		await popup.locator(FONT_ITEM).nth(1).click();

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('font-family');
	});

	test('Font applies across multiple blocks', async ({ editor, page }) => {
		await editor.typeText('First');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second', { delay: 10 });
		await page.keyboard.press('Control+a');

		const fontBtn = editor.markButton('font');
		await fontBtn.click();
		const popup = editor.root.locator('.notectl-font-picker');
		await popup.locator(FONT_ITEM).nth(1).click();

		const html = await editor.getHTML();
		const fontFamilyCount = (html.match(/font-family/g) || []).length;
		expect(fontFamilyCount).toBeGreaterThanOrEqual(2);
	});
});
