import { expect, test } from './fixtures/editor-page';
import { MARK_CONFIGS } from './fixtures/mark-test-data';

// ── Parametrized mark tests (8 tests × 3 marks = 24) ───────────

for (const mark of MARK_CONFIGS) {
	test.describe(mark.name, () => {
		test(`Keyboard ${mark.shortcut} makes text ${mark.name.toLowerCase()}`, async ({
			editor,
			page,
		}) => {
			await editor.typeText('Hello');
			await page.keyboard.press('Control+a');
			await page.keyboard.press(mark.shortcut);

			const html = await editor.getHTML();
			expect(html).toContain(mark.htmlTag);
		});

		test(`${mark.name} toggle off removes ${mark.name.toLowerCase()}`, async ({ editor, page }) => {
			await editor.typeText('Hello');
			await page.keyboard.press('Control+a');
			await page.keyboard.press(mark.shortcut);
			await page.keyboard.press(mark.shortcut);

			const html = await editor.getHTML();
			expect(html).not.toContain(mark.htmlTag);
		});

		test(`${mark.name} at cursor affects next typed text`, async ({ editor, page }) => {
			await editor.focus();
			await page.keyboard.press(mark.shortcut);
			await page.keyboard.type(`${mark.name} text`, { delay: 10 });

			const html = await editor.getHTML();
			expect(html).toContain(mark.htmlTag);
		});

		test(`Toolbar ${mark.name} button`, async ({ editor, page }) => {
			await editor.typeText('Hello');
			await page.keyboard.press('Control+a');

			await editor.markButton(mark.markType).click();

			const html = await editor.getHTML();
			expect(html).toContain(mark.htmlTag);
		});
	});
}

// ── Bold-specific tests (2) ─────────────────────────────────────

test.describe('Bold — specific', () => {
	test('Bold partial — only part of a word', async ({ editor, page }) => {
		await editor.typeText('Hello');
		for (let i = 0; i < 4; i++) {
			await page.keyboard.press('ArrowLeft');
		}
		await page.keyboard.press('Shift+ArrowRight');
		await page.keyboard.press('Shift+ArrowRight');
		await page.keyboard.press('Shift+ArrowRight');
		// Allow selection change to sync back to editor state
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+b');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('H');
		expect(html).toContain('o');
	});

	test('Bold across multiple blocks', async ({ editor, page }) => {
		await editor.typeText('First');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Second', { delay: 10 });
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');

		const html = await editor.getHTML();
		const strongCount = (html.match(/<strong>/g) || []).length;
		expect(strongCount).toBeGreaterThanOrEqual(2);
	});
});

// ── Combined Marks (4) ──────────────────────────────────────────

test.describe('Combined Marks', () => {
	test('Bold + Italic combined', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');
		await page.keyboard.press('Control+i');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('<em>');
	});

	test('Bold + Italic + Underline combined', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');
		await page.keyboard.press('Control+i');
		await page.keyboard.press('Control+u');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('<em>');
		expect(html).toContain('<u>');
	});

	test('Marks partially overlapping', async ({ editor, page }) => {
		await editor.typeText('ABCD');
		await editor.selectRange(0, 0, 3);
		await page.keyboard.press('Control+b');
		await expect.poll(() => editor.getHTML()).toContain('<strong>');

		await editor.selectRange(0, 1, 4);
		await page.keyboard.press('Control+i');
		await expect.poll(() => editor.getHTML()).toContain('<em>');

		const html = await editor.getHTML();
		expect(html).toContain('<strong>');
		expect(html).toContain('<em>');
		const text = await editor.getText();
		expect(text).toBe('ABCD');
	});

	test('Remove one mark from combined text', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Control+a');
		await page.keyboard.press('Control+b');
		await page.keyboard.press('Control+i');

		await page.keyboard.press('Control+b');

		const html = await editor.getHTML();
		expect(html).not.toContain('<strong>');
		expect(html).toContain('<em>');
	});
});
