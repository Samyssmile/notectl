import { expect, test } from '@playwright/test';
import type {} from '../examples/vanillajs/src/custom-ui.js';

test('touch controls keep the model selection and open a feature popup', async ({ page }) => {
	await page.goto('/custom-ui.html');
	await page.waitForFunction(() => !!window.uiDemo);
	await page.evaluate(() => {
		const { editor } = window.uiDemo.external;
		const state = editor.getState();
		const block = state.doc.children[0];
		if (block)
			editor.dispatch(
				state
					.transaction('api')
					.setSelection({
						anchor: { blockId: block.id, offset: 0 },
						head: { blockId: block.id, offset: 6 },
					})
					.build(),
			);
	});
	await page.locator('#external-controls [data-action="bold"]').tap();
	await expect(page.locator('#external-controls [data-action="bold"]')).toHaveAttribute(
		'aria-pressed',
		'true',
	);
	await page.locator('#external-controls [data-action="fontSize"]').tap();
	await expect(page.locator('#external-editor .notectl-toolbar-popup')).toBeVisible();
	await page.getByRole('heading', { name: 'External controls', exact: true }).tap();
	await expect(page.locator('#external-editor .notectl-toolbar-popup')).toHaveCount(0);
});
