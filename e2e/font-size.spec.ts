import { expect, test } from './fixtures/editor-page';

const SIZE_ITEM = '.notectl-font-size-picker__item';

/**
 * Recreates the editor with FontSizePlugin configured with
 * `{ sizes: [12, 16, 24, 32, 48], defaultSize: 12 }`.
 */
async function recreateWithDefaultSize12(page: import('@playwright/test').Page): Promise<void> {
	await page.evaluate(async () => {
		type El = HTMLElement & {
			init(config: unknown): Promise<void>;
			destroy(): void;
		};
		const container = document.getElementById('editor-container');
		const existing = container?.querySelector('notectl-editor') as El | null;
		if (existing) {
			existing.destroy();
			existing.remove();
		}
		if (!container) return;

		const W = window as unknown as Record<string, new (cfg?: unknown) => unknown>;
		const TFP = W.TextFormattingPlugin as new (cfg?: unknown) => unknown;
		const FSP = W.FontSizePlugin as new (cfg?: unknown) => unknown;

		const fontSizePlugin = new FSP({ sizes: [12, 16, 24, 32, 48], defaultSize: 12 });
		const textFormatting = new TFP({ bold: true, italic: true, underline: true });

		const el = document.createElement('notectl-editor') as unknown as El;
		await el.init({
			toolbar: [[fontSizePlugin], [textFormatting]],
			autofocus: true,
		});
		container.appendChild(el);
	});

	// Wait for new editor to be ready
	const editor = page.locator('notectl-editor');
	await editor.waitFor();
	await editor.locator('div.notectl-content').waitFor();
}

test.describe('FontSizePlugin', () => {
	test('Font size toolbar button is visible', async ({ editor }) => {
		const sizeBtn = editor.markButton('fontSize');
		await expect(sizeBtn).toBeVisible();
	});

	test('Font size popup opens and shows size list', async ({ editor }) => {
		const sizeBtn = editor.markButton('fontSize');
		await sizeBtn.click();

		const popup = editor.root.locator('.notectl-font-size-picker');
		await expect(popup).toBeVisible();

		const items = popup.locator(SIZE_ITEM);
		const count = await items.count();
		expect(count).toBeGreaterThan(0);
	});

	test('Clicking font size input field does not close popup', async ({ editor, page }) => {
		const sizeBtn = editor.markButton('fontSize');
		await sizeBtn.click();

		const popup = editor.root.locator('.notectl-font-size-picker');
		await expect(popup).toBeVisible();

		// Click the input field inside the popup
		const input = popup.locator('input');
		await expect(input).toBeVisible();
		await input.click();
		// Popup should remain open after clicking its input
		await expect(popup).toBeVisible();
	});

	test('Selecting default size (12) removes font-size mark', async ({ editor, page }) => {
		await recreateWithDefaultSize12(page);

		const content = page.locator('notectl-editor').locator('div.notectl-content');
		await content.click();

		await page.keyboard.type('Hello', { delay: 10 });
		await page.keyboard.press('Control+a');

		const sizeBtn = page.locator('notectl-editor').locator('button[data-toolbar-item="fontSize"]');

		// Apply size 24
		await sizeBtn.click();
		let popup = page.locator('notectl-editor').locator('.notectl-font-size-picker');
		const item24 = popup.locator(SIZE_ITEM).filter({ hasText: /^.*24$/ });
		await item24.click();

		// Verify size 24 is applied in JSON
		let json = await page.evaluate(() => {
			type El = HTMLElement & { getJSON(): unknown };
			return (document.querySelector('notectl-editor') as unknown as El).getJSON();
		});
		let firstBlock = (json as { children: { children: { marks?: { type: string }[] }[] }[] })
			.children[0];
		let hasSize = firstBlock?.children.some((c) => c.marks?.some((m) => m.type === 'fontSize'));
		expect(hasSize).toBe(true);

		// Now select all and choose default size (12) to remove the mark
		await page.keyboard.press('Control+a');
		await sizeBtn.click();
		popup = page.locator('notectl-editor').locator('.notectl-font-size-picker');
		const item12 = popup.locator(SIZE_ITEM).filter({ hasText: /^.*12$/ });
		await item12.click();

		// Verify fontSize mark is removed
		json = await page.evaluate(() => {
			type El = HTMLElement & { getJSON(): unknown };
			return (document.querySelector('notectl-editor') as unknown as El).getJSON();
		});
		firstBlock = (json as { children: { children: { marks?: { type: string }[] }[] }[] })
			.children[0];
		hasSize = firstBlock?.children.some((c) => c.marks?.some((m) => m.type === 'fontSize'));
		expect(hasSize).toBe(false);
	});
});
