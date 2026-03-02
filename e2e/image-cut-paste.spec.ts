import { expect, test } from './fixtures/editor-page';

type JsonChild = {
	type: string;
	children?: JsonChild[];
	attrs?: Record<string, unknown>;
	text?: string;
};

test.describe('Image cut & paste (select all)', () => {
	test.beforeEach(async ({ context }) => {
		try {
			await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		} catch {
			// Best-effort: some browsers do not expose clipboard permissions via Playwright.
		}
	});

	test('select all, cut, paste preserves image block', async ({ editor, page }) => {
		await editor.focus();

		// --- Step 1: Type some text in the initial paragraph ---
		await page.keyboard.type('Hello World', { delay: 10 });

		// --- Step 2: Insert an image via toolbar file upload ---
		const imageBtn = editor.markButton('image');
		await imageBtn.click();

		const uploadBtn = page.locator(
			'notectl-editor button[aria-label="Upload image from computer"]',
		);
		const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), uploadBtn.click()]);
		await fileChooser.setFiles('e2e/fixtures/mage.png');

		const imgLocator = page.locator('notectl-editor .notectl-image__img');
		await imgLocator.waitFor({ state: 'visible', timeout: 5000 });

		// Wait for image dimensions to be committed
		await expect(async () => {
			const json: { children: JsonChild[] } = await editor.getJSON();
			const imageBlock = json.children.find((c) => c.type === 'image');
			expect(imageBlock?.attrs?.width).toBeDefined();
		}).toPass({ timeout: 3000 });

		// Move past the image and type more text
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('End');
		await page.keyboard.type('After image', { delay: 10 });

		// Verify initial state: paragraph + image + paragraph
		const beforeJson: { children: JsonChild[] } = await editor.getJSON();
		const beforeTypes: string[] = beforeJson.children.map((c) => c.type);
		expect(beforeTypes).toContain('image');

		// --- Step 3: Select all, cut, paste ---
		await page.keyboard.press('Control+a');
		await page.waitForTimeout(100);
		await page.keyboard.press('Control+x');
		await page.waitForTimeout(200);
		await page.keyboard.press('Control+v');
		await page.waitForTimeout(500);

		// --- Step 4: Verify the image block is restored ---
		const afterJson: { children: JsonChild[] } = await editor.getJSON();
		const afterTypes: string[] = afterJson.children.map((c) => c.type);

		// The image block should be present after paste
		expect(afterTypes).toContain('image');

		// Verify the image is visible in the DOM
		await expect(imgLocator).toBeVisible({ timeout: 3000 });

		// Verify image src is a blob: URL (preserved through DOMPurify sanitization)
		const afterImageBlock = afterJson.children.find((c) => c.type === 'image');
		const src = afterImageBlock?.attrs?.src as string;
		expect(src).toMatch(/^blob:/);
	});
});
