import { expect, test } from './fixtures/editor-page';

/**
 * Bug regression: applying a heading type (Title, Subtitle, Heading) to text
 * that already has inline marks (fontSize, bold) must strip conflicting marks
 * so the heading's visual style takes effect.
 */
test.describe('Heading with pre-formatted text', () => {
	test('Title strips fontSize mark from bold + fontSize text', async ({ editor, page }) => {
		// 1. Set font-size to 12 and bold, then type text
		await editor.focus();
		const sizeBtn = editor.markButton('fontSize');
		await sizeBtn.click();
		const popup = editor.root.locator('.notectl-font-size-picker');
		await expect(popup).toBeVisible();
		const item12 = popup.locator('.notectl-font-size-picker__item').filter({ hasText: /^.*12$/ });
		await item12.click();

		await page.keyboard.press('Control+b');
		await page.keyboard.type('Hello World', { delay: 10 });

		// 2. Select all and apply Title
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		const headingBtn = editor.markButton('heading');
		await headingBtn.click();
		const headingPopup = editor.root.locator('.notectl-heading-picker');
		await expect(headingPopup).toBeVisible();
		const titleItem = headingPopup.getByRole('button', { name: 'Title', exact: true });
		await titleItem.click();

		// 3. Verify block type is 'title'
		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('title');

		// 4. Verify fontSize mark is stripped
		const hasFontSize = json.children[0]?.children.some((c: { marks?: { type: string }[] }) =>
			c.marks?.some((m) => m.type === 'fontSize'),
		);
		expect(hasFontSize).toBe(false);

		// 5. Verify bold mark is preserved
		const hasBold = json.children[0]?.children.some((c: { marks?: { type: string }[] }) =>
			c.marks?.some((m) => m.type === 'bold'),
		);
		expect(hasBold).toBe(true);

		// 6. Verify text content is preserved
		const text = await editor.getText();
		expect(text.trim()).toBe('Hello World');
	});

	test('Subtitle strips fontSize mark', async ({ editor, page }) => {
		await editor.focus();
		const sizeBtn = editor.markButton('fontSize');
		await sizeBtn.click();
		const popup = editor.root.locator('.notectl-font-size-picker');
		const item24 = popup.locator('.notectl-font-size-picker__item').filter({ hasText: /^.*24$/ });
		await item24.click();
		await page.keyboard.type('Subtitle Text', { delay: 10 });

		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		const headingBtn = editor.markButton('heading');
		await headingBtn.click();
		const headingPopup = editor.root.locator('.notectl-heading-picker');
		await expect(headingPopup).toBeVisible();
		const subtitleItem = headingPopup.getByRole('button', { name: 'Subtitle', exact: true });
		await subtitleItem.click();

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('subtitle');

		const hasFontSize = json.children[0]?.children.some((c: { marks?: { type: string }[] }) =>
			c.marks?.some((m) => m.type === 'fontSize'),
		);
		expect(hasFontSize).toBe(false);
	});

	test('Heading 1 via keyboard shortcut strips fontSize mark', async ({ editor, page }) => {
		await editor.focus();
		const sizeBtn = editor.markButton('fontSize');
		await sizeBtn.click();
		const popup = editor.root.locator('.notectl-font-size-picker');
		const item32 = popup.locator('.notectl-font-size-picker__item').filter({ hasText: /^.*32$/ });
		await item32.click();
		await page.keyboard.type('Heading Text', { delay: 10 });

		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+Shift+1');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[0]?.attrs?.level).toBe(1);

		const hasFontSize = json.children[0]?.children.some((c: { marks?: { type: string }[] }) =>
			c.marks?.some((m) => m.type === 'fontSize'),
		);
		expect(hasFontSize).toBe(false);
	});

	test('Undo restores fontSize mark after heading conversion', async ({ editor, page }) => {
		await editor.focus();
		const sizeBtn = editor.markButton('fontSize');
		await sizeBtn.click();
		const popup = editor.root.locator('.notectl-font-size-picker');
		const item24 = popup.locator('.notectl-font-size-picker__item').filter({ hasText: /^.*24$/ });
		await item24.click();
		await page.keyboard.type('Undo Test', { delay: 10 });

		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		const headingBtn = editor.markButton('heading');
		await headingBtn.click();
		const headingPopup = editor.root.locator('.notectl-heading-picker');
		await expect(headingPopup).toBeVisible();
		const titleItem = headingPopup.getByRole('button', { name: 'Title', exact: true });
		await titleItem.click();

		// Verify heading applied
		let json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('title');

		// Undo
		await page.keyboard.press('Control+z');

		// Verify reverted: block is paragraph, fontSize mark restored
		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');

		const hasFontSize = json.children[0]?.children.some((c: { marks?: { type: string }[] }) =>
			c.marks?.some((m) => m.type === 'fontSize'),
		);
		expect(hasFontSize).toBe(true);
	});

	test('Bold + italic preserved, only fontSize stripped', async ({ editor, page }) => {
		await editor.focus();

		// Apply bold, italic, and fontSize
		await page.keyboard.press('Control+b');
		await page.keyboard.press('Control+i');
		const sizeBtn = editor.markButton('fontSize');
		await sizeBtn.click();
		const popup = editor.root.locator('.notectl-font-size-picker');
		const item48 = popup.locator('.notectl-font-size-picker__item').filter({ hasText: /^.*48$/ });
		await item48.click();
		await page.keyboard.type('Rich Text', { delay: 10 });

		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+Shift+2');

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('heading');
		expect(json.children[0]?.attrs?.level).toBe(2);

		const marks: string[] =
			json.children[0]?.children.flatMap(
				(c: { marks?: { type: string }[] }) => c.marks?.map((m) => m.type) ?? [],
			) ?? [];

		expect(marks).toContain('bold');
		expect(marks).toContain('italic');
		expect(marks).not.toContain('fontSize');
	});

	test('Plain text heading conversion still works without marks', async ({ editor, page }) => {
		await editor.typeText('Plain heading');

		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		const headingBtn = editor.markButton('heading');
		await headingBtn.click();
		const headingPopup = editor.root.locator('.notectl-heading-picker');
		await expect(headingPopup).toBeVisible();
		const titleItem = headingPopup.getByRole('button', { name: 'Title', exact: true });
		await titleItem.click();

		const json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('title');
		expect(await editor.getText()).toContain('Plain heading');
	});

	test('Toggle heading back to paragraph preserves remaining marks', async ({ editor, page }) => {
		await editor.focus();

		// Type bold + fontSize text
		await page.keyboard.press('Control+b');
		const sizeBtn = editor.markButton('fontSize');
		await sizeBtn.click();
		const popup = editor.root.locator('.notectl-font-size-picker');
		const item24 = popup.locator('.notectl-font-size-picker__item').filter({ hasText: /^.*24$/ });
		await item24.click();
		await page.keyboard.type('Toggle Test', { delay: 10 });

		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		// Convert to Title (strips fontSize, keeps bold)
		const headingBtn = editor.markButton('heading');
		await headingBtn.click();
		let headingPopup = editor.root.locator('.notectl-heading-picker');
		const titleItem = headingPopup.getByRole('button', { name: 'Title', exact: true });
		await titleItem.click();

		let json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('title');

		// Convert back to Paragraph (bold should be preserved)
		await headingBtn.click();
		headingPopup = editor.root.locator('.notectl-heading-picker');
		const paraItem = headingPopup.getByRole('button', { name: 'Paragraph', exact: true });
		await paraItem.click();

		json = await editor.getJSON();
		expect(json.children[0]?.type).toBe('paragraph');

		const hasBold = json.children[0]?.children.some((c: { marks?: { type: string }[] }) =>
			c.marks?.some((m) => m.type === 'bold'),
		);
		expect(hasBold).toBe(true);
	});

	test('DOM renders heading element without inline font-size override', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		const sizeBtn = editor.markButton('fontSize');
		await sizeBtn.click();
		const popup = editor.root.locator('.notectl-font-size-picker');
		const item12 = popup.locator('.notectl-font-size-picker__item').filter({ hasText: /^.*12$/ });
		await item12.click();
		await page.keyboard.type('Visual Check', { delay: 10 });

		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);

		const headingBtn = editor.markButton('heading');
		await headingBtn.click();
		const headingPopup = editor.root.locator('.notectl-heading-picker');
		const titleItem = headingPopup.getByRole('button', { name: 'Title', exact: true });
		await titleItem.click();

		// Verify no font-size span in the DOM
		const hasFontSizeSpan = await page.evaluate(() => {
			const editorEl = document.querySelector('notectl-editor');
			const h1 = editorEl?.shadowRoot?.querySelector('h1');
			return h1?.querySelector('span[style*="font-size"]') !== null;
		});
		expect(hasFontSizeSpan).toBe(false);

		// Verify it renders as h1
		const h1Visible = editor.content.locator('h1.notectl-title');
		await expect(h1Visible).toBeVisible();
	});
});
