import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Angular Integration Contract Tests
 *
 * Tests behavior specific to the Angular wrapper layer — things that would
 * NOT be caught by running the same tests against the VanillaJS example.
 *
 * Focus: Error-free bootstrap through the Angular lifecycle (afterNextRender,
 * zoneless change detection, custom element registration).
 */

// --- Helpers ---

async function waitForEditor(page: Page): Promise<void> {
	await page.waitForFunction(
		() => {
			const ntl = document.querySelector('ntl-editor');
			const inner = ntl?.querySelector('notectl-editor');
			return inner?.shadowRoot?.querySelector('.notectl-content') !== null;
		},
		{ timeout: 30000 },
	);
}

function content(page: Page) {
	return page.locator('ntl-editor notectl-editor div.notectl-content');
}

// ─────────────────────────────────────────────────────────────────────
// Client Bootstrap
// ─────────────────────────────────────────────────────────────────────

test.describe('Angular — Client Bootstrap', () => {
	test('no console errors during bootstrap', async ({ page }) => {
		const errors: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				errors.push(msg.text());
			}
		});
		page.on('pageerror', (err) => {
			errors.push(err.message);
		});

		await page.goto('/');
		await waitForEditor(page);

		// Interact to surface any deferred initialization errors
		await content(page).click();
		await page.keyboard.type('Bootstrap check', { delay: 10 });

		const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('404'));
		expect(realErrors).toEqual([]);
	});
});
