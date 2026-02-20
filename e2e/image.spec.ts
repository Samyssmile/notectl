import { expect, test } from './fixtures/editor-page';

/** 1×1 transparent PNG as a data URI (avoids external network requests). */
const DATA_URI_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test.describe('Image', () => {
	test('insert image via URL input', async ({ editor, page }) => {
		await editor.focus();

		const imageBtn = editor.markButton('image');
		await imageBtn.click();

		const urlInput = page.locator('notectl-editor input[aria-label="Image URL"]');
		await urlInput.waitFor({ state: 'visible' });
		await urlInput.fill(DATA_URI_PNG);

		const insertBtn = page.locator('notectl-editor button[aria-label="Insert image"]');
		await insertBtn.click();

		const figure = page.locator('notectl-editor figure.notectl-image');
		await figure.waitFor({ state: 'visible', timeout: 5000 });

		const img = page.locator('notectl-editor .notectl-image__img');
		await expect(img).toBeVisible();

		const src = await img.getAttribute('src');
		expect(src).toContain('data:image/png');
	});

	test('insert image via file upload', async ({ editor, page }) => {
		await editor.focus();

		const imageBtn = editor.markButton('image');
		await imageBtn.click();

		const fileInput = page.locator('notectl-editor input[type="file"]');
		await fileInput.setInputFiles('e2e/fixtures/mage.png');

		const img = page.locator('notectl-editor .notectl-image__img');
		await img.waitFor({ state: 'visible', timeout: 5000 });

		const imgState = await page.evaluate(() => {
			const el = document.querySelector('notectl-editor');
			const imgEl = el?.shadowRoot?.querySelector('.notectl-image__img') as HTMLImageElement | null;
			if (!imgEl) return { found: false, naturalWidth: 0, naturalHeight: 0 };
			return {
				found: true,
				naturalWidth: imgEl.naturalWidth,
				naturalHeight: imgEl.naturalHeight,
			};
		});

		expect(imgState.found).toBe(true);
		expect(imgState.naturalWidth).toBeGreaterThan(0);
		expect(imgState.naturalHeight).toBeGreaterThan(0);
	});

	test('delete image with Backspace', async ({ editor, page }) => {
		await editor.focus();

		const imageBtn = editor.markButton('image');
		await imageBtn.click();

		const fileInput = page.locator('notectl-editor input[type="file"]');
		await fileInput.setInputFiles('e2e/fixtures/mage.png');

		const figure = page.locator('notectl-editor figure.notectl-image');
		await figure.waitFor({ state: 'visible', timeout: 5000 });

		// Click the figure to select it
		await figure.click({ force: true });
		await page.waitForTimeout(200);

		await page.keyboard.press('Backspace');

		type JsonChild = { type: string; children?: JsonChild[] };
		const json: { children: JsonChild[] } = await editor.getJSON();
		const hasImage = json.children.some((c) => c.type === 'image');
		expect(hasImage).toBe(false);
	});

	test('undo image insertion', async ({ editor, page }) => {
		await editor.focus();

		const imageBtn = editor.markButton('image');
		await imageBtn.click();

		const fileInput = page.locator('notectl-editor input[type="file"]');
		await fileInput.setInputFiles('e2e/fixtures/mage.png');

		const img = page.locator('notectl-editor .notectl-image__img');
		await img.waitFor({ state: 'visible', timeout: 5000 });

		// Ensure focus is in editor before undo
		await editor.focus();
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+z');

		type JsonChild = { type: string; children?: JsonChild[] };
		const json: { children: JsonChild[] } = await editor.getJSON();
		const hasImage = json.children.some((c) => c.type === 'image');
		expect(hasImage).toBe(false);
	});
});
