/**
 * E2E regression test for issue #82: createFullPreset() without font options
 * must not crash. FontPlugin({ fonts: [] }) gracefully degrades — the editor
 * initializes, the toolbar renders without a font picker button, and text
 * input works normally.
 *
 * @see https://github.com/SamySmile/notectl/issues/82
 */
import { expect } from '@playwright/test';
import { test } from './fixtures/editor-page.js';

const FULL_PRESET_NO_FONTS = {
	toolbar: [
		[{ name: 'FontPlugin', config: { fonts: [] } }, { name: 'FontSizePlugin' }],
		[{ name: 'TextFormattingPlugin' }],
		[{ name: 'TextColorPlugin' }, { name: 'HighlightPlugin' }],
		[{ name: 'HeadingPlugin' }, { name: 'BlockquotePlugin' }],
		[{ name: 'AlignmentPlugin' }],
		[{ name: 'ListPlugin' }],
		[
			{ name: 'LinkPlugin' },
			{ name: 'TablePlugin' },
			{ name: 'HorizontalRulePlugin' },
			{ name: 'ImagePlugin' },
		],
	],
} as const;

test.describe('Issue #82 — Full preset without font config', () => {
	test('editor initializes without errors', async ({ editor, page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(err.message));

		await editor.recreateWithPlugins(FULL_PRESET_NO_FONTS);

		await expect(editor.root).toBeVisible();
		await expect(editor.content).toBeVisible();
		expect(errors).toHaveLength(0);
	});

	test('editor accepts text input after init', async ({ editor }) => {
		await editor.recreateWithPlugins(FULL_PRESET_NO_FONTS);
		await editor.typeText('Hello without fonts');

		const text: string = await editor.getText();
		expect(text).toContain('Hello without fonts');
	});

	test('font picker button is hidden when no fonts configured', async ({ editor }) => {
		await editor.recreateWithPlugins(FULL_PRESET_NO_FONTS);

		const fontButton = editor.root.locator('[data-toolbar-item="font"]');
		await expect(fontButton).toHaveCount(0);
	});
});
