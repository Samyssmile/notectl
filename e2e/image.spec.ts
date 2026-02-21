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

		// The image popup must close after insertion
		await expect(urlInput).toBeHidden({ timeout: 2000 });

		const img = page.locator('notectl-editor .notectl-image__img');
		await expect(img).toBeVisible();

		const src = await img.getAttribute('src');
		expect(src).toContain('data:image/png');
	});

	test('insert image via file upload', async ({ editor, page }) => {
		await editor.focus();

		const imageBtn = editor.markButton('image');
		await imageBtn.click();

		const uploadBtn = page.locator(
			'notectl-editor button[aria-label="Upload image from computer"]',
		);
		await uploadBtn.waitFor({ state: 'visible' });

		const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), uploadBtn.click()]);
		await fileChooser.setFiles('e2e/fixtures/mage.png');

		const img = page.locator('notectl-editor .notectl-image__img');
		await img.waitFor({ state: 'visible', timeout: 5000 });

		// The image popup must close after a file is inserted
		await expect(uploadBtn).toBeHidden({ timeout: 2000 });

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

		const uploadBtn = page.locator(
			'notectl-editor button[aria-label="Upload image from computer"]',
		);
		const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), uploadBtn.click()]);
		await fileChooser.setFiles('e2e/fixtures/mage.png');

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

	test('resize image with keyboard shortcut after file upload', async ({ editor, page }) => {
		await editor.focus();

		const imageBtn = editor.markButton('image');
		await imageBtn.click();

		const uploadBtn = page.locator(
			'notectl-editor button[aria-label="Upload image from computer"]',
		);
		const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), uploadBtn.click()]);
		await fileChooser.setFiles('e2e/fixtures/mage.png');

		const img = page.locator('notectl-editor .notectl-image__img');
		await img.waitFor({ state: 'visible', timeout: 5000 });

		// Wait for image to load and dimensions to be committed
		type JsonChild = { type: string; attrs?: Record<string, unknown> };
		await expect(async () => {
			const json: { children: JsonChild[] } = await editor.getJSON();
			const imageBlock = json.children.find((c) => c.type === 'image');
			expect(imageBlock?.attrs?.width).toBeDefined();
		}).toPass({ timeout: 3000 });

		const jsonBefore: { children: JsonChild[] } = await editor.getJSON();
		const imageBefore = jsonBefore.children.find((c) => c.type === 'image');
		const widthBefore = imageBefore?.attrs?.width as number;

		// Image should be selected and editor focused after insertion — no extra click needed.
		// Press Ctrl+Shift+ArrowLeft to shrink image (image is already at maxWidth)
		await page.keyboard.press('Control+Shift+ArrowLeft');

		const jsonAfter: { children: JsonChild[] } = await editor.getJSON();
		const imageAfter = jsonAfter.children.find((c) => c.type === 'image');
		const widthAfter = imageAfter?.attrs?.width as number;

		expect(widthAfter).toBeLessThan(widthBefore);
	});

	test('undo image insertion', async ({ editor, page }) => {
		await editor.focus();

		const imageBtn = editor.markButton('image');
		await imageBtn.click();

		const uploadBtn = page.locator(
			'notectl-editor button[aria-label="Upload image from computer"]',
		);
		const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), uploadBtn.click()]);
		await fileChooser.setFiles('e2e/fixtures/mage.png');

		const img = page.locator('notectl-editor .notectl-image__img');
		await img.waitFor({ state: 'visible', timeout: 5000 });

		// Wait for onload dimension commit to settle before undoing
		type JsonChild = { type: string; attrs?: Record<string, unknown>; children?: JsonChild[] };
		await expect(async () => {
			const json: { children: JsonChild[] } = await editor.getJSON();
			const imageBlock = json.children.find((c) => c.type === 'image');
			expect(imageBlock?.attrs?.width).toBeDefined();
		}).toPass({ timeout: 3000 });

		// Editor should be focused after insertion — Ctrl+Z should work directly.
		// Two undos: dimension commit (onload) + image insertion.
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+z');

		const json: { children: JsonChild[] } = await editor.getJSON();
		const hasImage = json.children.some((c) => c.type === 'image');
		expect(hasImage).toBe(false);
	});
});
