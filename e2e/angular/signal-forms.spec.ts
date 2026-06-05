import { expect, test } from '@playwright/test';

// Runtime proof that <ntl-editor> binds to Angular 22 Signal Forms via its FormValueControl
// `value` model: a `form(signal<Document>(...))` bound with [formField] round-trips both ways.
const SECTION = '[data-testid="signal-forms-section"]';
const CONTENT = `${SECTION} notectl-editor .notectl-content`;

test.describe('Angular — Signal Forms (FormValueControl) binding', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.locator(CONTENT).waitFor({ timeout: 30_000 });
	});

	test('initial field value renders in the editor and in the form model', async ({ page }) => {
		await expect(page.locator(CONTENT)).toContainText('Signal Forms initial');
		await expect(page.getByTestId('signal-form-json')).toContainText('Signal Forms initial');
	});

	test('editing the editor updates the signal form model (editor -> field)', async ({ page }) => {
		const content = page.locator(CONTENT);
		await content.click();
		await page.keyboard.press('End');
		await page.keyboard.type(' EDITED', { delay: 10 });

		await expect(page.getByTestId('signal-form-json')).toContainText('EDITED');
	});

	test('setting the form model updates the editor (field -> editor)', async ({ page }) => {
		await page.getByTestId('set-signal-form').click();

		await expect(page.locator(CONTENT)).toContainText('Set via Signal Form');
		await expect(page.getByTestId('signal-form-json')).toContainText('Set via Signal Form');
	});

	test('blurring the editor marks the field touched (touch output)', async ({ page }) => {
		const touched = page.getByTestId('signal-form-touched');
		// Applying the initial document focuses the editor, so start from a clean touched state.
		await page.getByTestId('reset-signal-form').click();
		await expect(touched).toHaveText('false');

		await page.locator(CONTENT).click();
		await page.locator('h1').click(); // move focus out of the editor -> blur

		await expect(touched).toHaveText('true');
	});

	test('a disabled field drives the editor readonly/aria-disabled (disabled input)', async ({
		page,
	}) => {
		const host = page.locator(`${SECTION} ntl-editor`);
		await expect(host).not.toHaveAttribute('aria-disabled', 'true');

		await page.getByTestId('toggle-signal-disabled').click();

		await expect(host).toHaveAttribute('aria-disabled', 'true');
	});
});
