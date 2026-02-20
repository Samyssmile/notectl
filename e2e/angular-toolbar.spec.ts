import { expect, test } from '@playwright/test';

/**
 * E2E tests for the Angular integration (`@notectl/angular`).
 *
 * Requires the Angular dev server running on port 4200:
 *   cd examples/angular && pnpm start
 */
test.describe('Angular Editor Integration', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:4200', { waitUntil: 'networkidle' });
		// Wait for Angular bootstrap and async editor init
		await page.waitForTimeout(2000);
	});

	test('should render the editor with toolbar', async ({ page }) => {
		// Angular component <ntl-editor> wraps the <notectl-editor> web component
		const angularHost = page.locator('ntl-editor');
		await expect(angularHost).toBeAttached();

		// Inner web component should exist with shadow DOM
		const hasToolbar = await page.evaluate(() => {
			const inner = document.querySelector('ntl-editor')?.querySelector('notectl-editor');
			if (!inner?.shadowRoot) return false;
			const toolbar = inner.shadowRoot.querySelector('.notectl-toolbar');
			return toolbar !== null && toolbar.children.length > 0;
		});
		expect(hasToolbar).toBe(true);
	});

	test('should register all configured plugins', async ({ page }) => {
		const pluginIds = await page.evaluate(() => {
			const inner = document.querySelector('ntl-editor')?.querySelector('notectl-editor');
			if (!inner) return [];
			const pm = (inner as unknown as Record<string, unknown>)['pluginManager'] as
				| Record<string, unknown>
				| undefined;
			if (!pm) return [];
			const plugins = pm['plugins'] as Map<string, unknown> | undefined;
			return plugins instanceof Map ? [...plugins.keys()] : [];
		});

		expect(pluginIds).toContain('text-formatting');
		expect(pluginIds).toContain('toolbar');
		expect(pluginIds).toContain('heading');
		expect(pluginIds).toContain('list');
		expect(pluginIds).toContain('link');
		expect(pluginIds).toContain('table');
		expect(pluginIds).toContain('hard-break');
		expect(pluginIds.length).toBeGreaterThanOrEqual(15);
	});

	test('should have editable content area', async ({ page }) => {
		const isEditable = await page.evaluate(() => {
			const inner = document.querySelector('ntl-editor')?.querySelector('notectl-editor');
			if (!inner?.shadowRoot) return false;
			const content = inner.shadowRoot.querySelector('.notectl-content');
			return content?.getAttribute('contenteditable') === 'true';
		});
		expect(isEditable).toBe(true);
	});
});
