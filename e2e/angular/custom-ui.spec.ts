import { expect, test } from '@playwright/test';

test('Angular renders and observes core actions without a standard toolbar', async ({ page }) => {
	await page.goto('/custom-ui');
	const content = page.getByRole('textbox', { name: 'Rich text editor' });
	await expect(page.locator('[data-action="bold"]')).toBeVisible();
	await expect(page.getByRole('toolbar')).toHaveCount(0);
	await content.click();
	await page.keyboard.press('ControlOrMeta+Home');
	await page.keyboard.press('ControlOrMeta+Shift+ArrowRight');
	await page.locator('[data-action="bold"]').click();
	await expect(page.locator('[data-action="bold"]')).toHaveAttribute('aria-pressed', 'true');
	await page.getByLabel('External text field').fill('outside');
	await page.locator('[data-action="fontSize"]').click();
	await expect(page.locator('.notectl-toolbar-popup')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('.notectl-toolbar-popup')).toHaveCount(0);
	await page.getByRole('button', { name: 'Return to selection' }).click();
	await expect(content).toBeFocused();
	await expect(page.getByLabel('Selection geometry')).toContainText('"geometry":{');
});
