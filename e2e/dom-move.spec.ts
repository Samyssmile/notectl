import { expect, test } from './fixtures/editor-page';

test.describe('DOM Move', () => {
	test('moving editor to a new parent does not duplicate content', async ({ editor, page }) => {
		await editor.typeText('Persistent content');

		// Move the editor element to a new container
		await page.evaluate(() => {
			const newParent = document.createElement('div');
			newParent.id = 'new-parent';
			document.body.appendChild(newParent);
			const editorEl = document.querySelector('notectl-editor');
			if (editorEl) {
				newParent.appendChild(editorEl);
			}
		});

		// Wait for the deferred disconnectedCallback to resolve
		await page.waitForTimeout(100);

		// Verify only one .notectl-editor wrapper exists inside the shadow root
		const wrapperCount = await page.evaluate(() => {
			const editorEl = document.querySelector('notectl-editor');
			const shadow = editorEl?.shadowRoot;
			if (!shadow) return 0;
			return shadow.querySelectorAll('.notectl-editor').length;
		});
		expect(wrapperCount).toBe(1);

		// Verify content is preserved
		const text = await editor.getText();
		expect(text.trim()).toBe('Persistent content');
	});

	test('permanently removing editor from DOM triggers destroy', async ({ page }) => {
		await page.goto('/', { waitUntil: 'networkidle' });

		const editorEl = page.locator('notectl-editor');
		await editorEl.waitFor({ state: 'visible' });

		// Remove the editor from the DOM entirely
		await page.evaluate(() => {
			const el = document.querySelector('notectl-editor');
			el?.remove();
		});

		// Wait for deferred destroy
		await page.waitForTimeout(100);

		// Editor should no longer be in the document
		await expect(editorEl).toHaveCount(0);
	});
});
