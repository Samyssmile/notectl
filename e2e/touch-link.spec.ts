import { expect, test } from './fixtures/editor-page';
import {
	LINK_DESTINATION,
	expectLinkPopup,
	routeLinkDestination,
} from './fixtures/link-navigation';

test.describe('Touch links', () => {
	test.beforeEach(async ({ editor, page }) => {
		await routeLinkDestination(page);
		await editor.setContentHTML(`<p><a href="${LINK_DESTINATION}">Open destination</a></p>`);
	});

	test('tap shows a preview with an accessible open action', async ({ editor, page }, testInfo) => {
		const before = await editor.getJSON();
		await editor.content.locator('a').tap();
		const preview = page.locator('.notectl-link-preview');
		await expect(preview).toBeVisible();
		const box = await preview.boundingBox();
		expect(box).not.toBeNull();
		if (box) {
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
		}
		await page.screenshot({ path: testInfo.outputPath('touch-link-preview.png') });
		await expectLinkPopup(page, () => preview.getByRole('link', { name: /Open link/ }).tap());
		expect(await editor.getJSON()).toEqual(before);
	});

	test('readonly tap opens directly and switching modes dismisses the preview', async ({
		editor,
		page,
	}) => {
		await editor.content.locator('a').tap();
		await editor.configure({ readonly: true });
		await expect(page.locator('.notectl-link-preview')).toHaveCount(0);
		await expectLinkPopup(page, () => editor.content.locator('a').tap());
		await editor.configure({ readonly: false });
		await editor.content.locator('a').tap();
		await expect(page.locator('.notectl-link-preview')).toBeVisible();
		await page.getByRole('button', { name: 'Close link preview' }).tap();
		await expect(page.locator('.notectl-link-preview')).toHaveCount(0);
	});

	test('long addresses wrap within a narrow viewport', async ({ editor, page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		const href: string = `${LINK_DESTINATION}/${'long-path-'.repeat(35)}`;
		await editor.setContentHTML(`<p><a href="${href}">Long address</a></p>`);
		await editor.content.locator('a').tap();
		const preview = page.locator('.notectl-link-preview');
		await expect(preview).toBeVisible();
		await expect(preview.locator('.notectl-link-preview__url')).toHaveText(href);
		const box = await preview.boundingBox();
		expect(box?.width).toBeLessThanOrEqual(312);
	});

	test('tapping outside dismisses the preview without opening the URL', async ({
		editor,
		page,
	}) => {
		await editor.content.locator('a').tap();
		await expect(page.locator('.notectl-link-preview')).toBeVisible();
		await page.locator('header').tap();
		await expect(page.locator('.notectl-link-preview')).toHaveCount(0);
		expect(page.context().pages()).toHaveLength(1);
	});
});
