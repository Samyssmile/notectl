import { expect, test } from './fixtures/editor-page';

test.describe('Text direction', () => {
	test('sets dir="rtl" on block via toolbar dropdown', async ({ editor }) => {
		await editor.typeText('Hallo Welt, das ist ein deutscher Text.');

		// Open text direction dropdown
		const dirBtn = editor.markButton('text-direction');
		await expect(dirBtn).toBeVisible();
		await dirBtn.click();

		const popup = editor.popup();
		await popup.waitFor({ state: 'visible' });

		// Click the RTL option by label text
		const rtlItem = popup.locator('[role="menuitem"]', { hasText: 'Right to Left' });
		await rtlItem.click();

		// Popup should close
		await popup.waitFor({ state: 'hidden' });

		// Verify the block has dir="rtl"
		const json = await editor.getJSON();
		expect(json.children[0]?.attrs?.dir).toBe('rtl');

		// Verify the text content is preserved
		const text: string = await editor.getText();
		expect(text).toContain('Hallo Welt, das ist ein deutscher Text.');
	});

	test('editor keeps focus after selecting RTL — can continue typing', async ({ editor, page }) => {
		await editor.typeText('Guten Morgen');

		// Open text direction dropdown and select RTL
		const dirBtn = editor.markButton('text-direction');
		await dirBtn.click();

		const popup = editor.popup();
		await popup.waitFor({ state: 'visible' });

		const rtlItem = popup.locator('[role="menuitem"]', { hasText: 'Right to Left' });
		await rtlItem.click();
		await popup.waitFor({ state: 'hidden' });

		// Type immediately without re-focusing — this verifies the bugfix
		await page.keyboard.type(', wie geht es?', { delay: 10 });

		const text: string = await editor.getText();
		expect(text).toContain('Guten Morgen, wie geht es?');
	});

	test('RTL renders dir attribute on the DOM block element', async ({ editor, page }) => {
		await editor.typeText('Dies ist ein Test.');

		// Set RTL via toolbar
		const dirBtn = editor.markButton('text-direction');
		await dirBtn.click();

		const popup = editor.popup();
		await popup.waitFor({ state: 'visible' });

		const rtlItem = popup.locator('[role="menuitem"]', { hasText: 'Right to Left' });
		await rtlItem.click();
		await popup.waitFor({ state: 'hidden' });

		// Verify the actual DOM element has dir="rtl"
		const dirAttr: string | null = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor');
			const block = el?.shadowRoot?.querySelector('[data-block-id]');
			return block?.getAttribute('dir') ?? null;
		});
		expect(dirAttr).toBe('rtl');
	});
});
