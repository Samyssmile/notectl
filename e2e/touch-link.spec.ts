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
		const preview = page.locator('.notectl-link-bubble');
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
		await expect(page.locator('.notectl-link-bubble')).toHaveCount(0);
		await expectLinkPopup(page, () => editor.content.locator('a').tap());
		await editor.configure({ readonly: false });
		await editor.content.locator('a').tap();
		await expect(page.locator('.notectl-link-bubble')).toBeVisible();
		await page.getByRole('button', { name: 'Close link bubble' }).tap();
		await expect(page.locator('.notectl-link-bubble')).toHaveCount(0);
	});

	test('the preview survives the scroll that follows a tap', async ({ editor, page }) => {
		await editor.setContentHTML(
			`<p><a href="${LINK_DESTINATION}">Open destination</a></p>${'<p>Filler paragraph.</p>'.repeat(30)}`,
		);
		await editor.content.locator('a').tap();
		const preview = page.locator('.notectl-link-bubble');
		await expect(preview).toBeVisible();
		await page.evaluate(() => window.scrollBy(0, 48));
		await expect(preview).toBeVisible();
		await expectLinkPopup(page, () => preview.getByRole('link', { name: /Open link/ }).tap());
	});

	test('long addresses wrap within a narrow viewport', async ({ editor, page }) => {
		await page.setViewportSize({ width: 320, height: 640 });
		const href: string = `${LINK_DESTINATION}/${'long-path-'.repeat(35)}`;
		await editor.setContentHTML(`<p><a href="${href}">Long address</a></p>`);
		await editor.content.locator('a').tap();
		const preview = page.locator('.notectl-link-bubble');
		await expect(preview).toBeVisible();
		await expect(preview.locator('.notectl-link-bubble__url')).toHaveText(href);
		const box = await preview.boundingBox();
		expect(box?.width).toBeLessThanOrEqual(312);
	});

	test('tapping outside dismisses the preview without opening the URL', async ({
		editor,
		page,
	}) => {
		await editor.content.locator('a').tap();
		await expect(page.locator('.notectl-link-bubble')).toBeVisible();
		await page.locator('header').tap();
		await expect(page.locator('.notectl-link-bubble')).toHaveCount(0);
		expect(page.context().pages()).toHaveLength(1);
	});
	test('touch actions have 44px targets and edit the link', async ({ editor, page }) => {
		await editor.content.locator('a').tap();
		const bubble = page.locator('.notectl-link-bubble');
		for (const name of ['Edit link', 'Remove link', 'Close link bubble']) {
			const box = await bubble.getByRole('button', { name, exact: true }).boundingBox();
			expect(box?.height).toBeGreaterThanOrEqual(44);
			expect(box?.width).toBeGreaterThanOrEqual(44);
		}
		await bubble.getByRole('button', { name: 'Edit link' }).tap();
		await bubble.getByRole('textbox').fill('/updated');
		await bubble.getByRole('button', { name: 'Apply link' }).tap();
		await expect(editor.content.locator('a')).toHaveAttribute('href', '/updated');
		await expect(bubble).toHaveCount(0);
	});
});
