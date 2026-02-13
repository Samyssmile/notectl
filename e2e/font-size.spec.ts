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

/** Returns computed font-size (in px) for each block's text content. */
async function getBlockFontSizes(page: import('@playwright/test').Page): Promise<string[]> {
	return page.evaluate(() => {
		const editor = document.querySelector('notectl-editor');
		const blocks = editor?.shadowRoot?.querySelectorAll('[data-block-id]');
		if (!blocks) return [];
		const sizes: string[] = [];
		for (const block of blocks) {
			// Check for a span with font-size first (explicit mark), then fall back to block
			const span = (block as HTMLElement).querySelector('span[style*="font-size"]');
			const target = span ?? block;
			sizes.push(window.getComputedStyle(target as Element).fontSize);
		}
		return sizes;
	});
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

	test('Default size text (12) should be visually smaller than size-16 text', async ({
		editor,
		page,
	}) => {
		// Recreate editor with defaultSize: 12
		await recreateWithDefaultSize12(page);

		const content = page.locator('notectl-editor').locator('div.notectl-content');
		await content.click();

		// Type text at default size (should be 12px)
		await page.keyboard.type('Default size text', { delay: 10 });

		// Create a new line
		await page.keyboard.press('Enter');

		// Open font size picker and select 16
		const sizeBtn = page.locator('notectl-editor').locator('button[data-toolbar-item="fontSize"]');
		await sizeBtn.click();

		const popup = page.locator('notectl-editor').locator('.notectl-font-size-picker');
		await expect(popup).toBeVisible();

		// Click on "16" in the list
		const item16 = popup.locator(SIZE_ITEM).filter({ hasText: /^.*16$/ });
		await item16.click();

		// Type text at size 16
		await page.keyboard.type('Size 16 text', { delay: 10 });

		// Check the model has fontSize mark on the second block
		const json = await page.evaluate(() => {
			type El = HTMLElement & { getJSON(): unknown };
			return (document.querySelector('notectl-editor') as unknown as El).getJSON();
		});
		const blocks = (json as { children: unknown[] }).children;
		expect(blocks.length).toBeGreaterThanOrEqual(2);

		// Measure actual computed font sizes
		const fontSizes = await getBlockFontSizes(page);
		expect(fontSizes.length).toBeGreaterThanOrEqual(2);

		const firstSize = Number.parseFloat(fontSizes[0] ?? '0');
		const secondSize = Number.parseFloat(fontSizes[1] ?? '0');

		// BUG: The first block (default size = 12) should be SMALLER than the second (16px).
		// Currently both render at 16px because defaultSize only affects the UI label,
		// not the actual CSS rendering of unformatted text.
		expect(firstSize).toBeLessThan(secondSize);
	});

	test('Size 24 visually increases text compared to default', async ({ editor, page }) => {
		await recreateWithDefaultSize12(page);

		const content = page.locator('notectl-editor').locator('div.notectl-content');
		await content.click();

		// Type text at default size
		await page.keyboard.type('Default', { delay: 10 });
		await page.keyboard.press('Enter');

		// Apply size 24 on second line
		const sizeBtn = page.locator('notectl-editor').locator('button[data-toolbar-item="fontSize"]');
		await sizeBtn.click();

		const popup = page.locator('notectl-editor').locator('.notectl-font-size-picker');
		const item24 = popup.locator(SIZE_ITEM).filter({ hasText: /^.*24$/ });
		await item24.click();

		await page.keyboard.type('Big text', { delay: 10 });

		const fontSizes = await getBlockFontSizes(page);
		const firstSize = Number.parseFloat(fontSizes[0] ?? '0');
		const secondSize = Number.parseFloat(fontSizes[1] ?? '0');

		// Size 24 should be visibly larger than the default
		expect(secondSize).toBeCloseTo(24, 0);
		expect(firstSize).toBeLessThan(secondSize);
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
