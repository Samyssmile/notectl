import type { Page } from '@playwright/test';
import { type EditorPage, expect, test } from './fixtures/editor-page';

/**
 * Entering and leaving the toolbar with the keyboard.
 *
 * The toolbar precedes the content in the DOM, so it is only reachable by
 * forward-tabbing from outside the editor. `Alt+F10` (the TinyMCE/CKEditor and
 * ARIA APG convention) and `Shift+Tab` provide the way in from the caret;
 * `Escape` provides the way back.
 */

/** The `data-toolbar-item` of the currently focused toolbar button, if any. */
async function focusedToolbarItem(editor: EditorPage): Promise<string | null | undefined> {
	return editor.root.evaluate((el) =>
		el.shadowRoot?.activeElement?.getAttribute('data-toolbar-item'),
	);
}

/** Whether the editable content currently holds focus. */
async function contentIsFocused(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const sr = document.querySelector('notectl-editor')?.shadowRoot;
		const content = sr?.querySelector('.notectl-content');
		return !!content && sr?.activeElement === content;
	});
}

test.describe('Toolbar keyboard access', () => {
	test.beforeEach(async ({ editor }) => {
		await editor.configure({ readonly: false });
	});

	test('Alt+F10 moves focus from the content into the toolbar', async ({ editor, page }) => {
		await editor.typeText('Hello');

		await page.keyboard.press('Alt+F10');

		expect(await focusedToolbarItem(editor)).toBeTruthy();
	});

	test('Shift+Tab moves focus from a paragraph into the toolbar', async ({ editor, page }) => {
		await editor.typeText('Hello');

		await page.keyboard.press('Shift+Tab');

		expect(await focusedToolbarItem(editor)).toBeTruthy();
	});

	test('Shift+Tab does not insert a tab character', async ({ editor, page }) => {
		await editor.typeText('Hello');

		await page.keyboard.press('Shift+Tab');

		const text: string = await editor.getText();
		expect(text.trim()).toBe('Hello');
	});

	test('the toolbar advertises the shortcut via aria-keyshortcuts', async ({ editor }) => {
		await expect(editor.toolbar()).toHaveAttribute('aria-keyshortcuts', 'Alt+F10');
	});

	test('Escape returns focus to the content with the caret intact', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Alt+F10');
		expect(await focusedToolbarItem(editor)).toBeTruthy();

		await page.keyboard.press('Escape');
		expect(await contentIsFocused(page)).toBe(true);

		// Typing lands where the caret was — no re-focus, no lost position.
		await page.keyboard.type(' World', { delay: 10 });
		const text: string = await editor.getText();
		expect(text.trim()).toBe('Hello World');
	});

	test('arrow keys still navigate after entering via Alt+F10', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Alt+F10');
		const first = await focusedToolbarItem(editor);

		await page.keyboard.press('ArrowRight');

		const next = await focusedToolbarItem(editor);
		expect(next).toBeTruthy();
		expect(next).not.toBe(first);
	});

	test('Tab from the toolbar moves forward into the content', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Alt+F10');
		expect(await focusedToolbarItem(editor)).toBeTruthy();

		await page.keyboard.press('Tab');

		expect(await contentIsFocused(page)).toBe(true);
	});

	test('Shift+Tab from the toolbar leaves the editor — no focus trap', async ({ editor, page }) => {
		// The demo page has no focusable element before the editor, so add one:
		// without a previous tab stop the browsers disagree about where focus goes
		// (Chromium drops to `body`, Firefox keeps it) and neither proves anything.
		await page.evaluate(() => {
			const container = document.getElementById('editor-container');
			const sentinel = document.createElement('button');
			sentinel.id = 'before-editor';
			sentinel.textContent = 'before';
			container?.parentElement?.insertBefore(sentinel, container);
		});

		await editor.typeText('Hello');
		await page.keyboard.press('Alt+F10');
		expect(await focusedToolbarItem(editor)).toBeTruthy();

		await page.keyboard.press('Shift+Tab');

		expect(await page.evaluate(() => document.activeElement?.id)).toBe('before-editor');
		expect(await focusedToolbarItem(editor)).toBeFalsy();
	});

	test('neither shortcut steals focus while the toolbar is hidden in read-only mode', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await editor.configure({ readonly: true });
		await expect(editor.toolbar()).toBeHidden();

		await page.keyboard.press('Alt+F10');
		expect(await focusedToolbarItem(editor)).toBeFalsy();

		await page.keyboard.press('Shift+Tab');
		expect(await focusedToolbarItem(editor)).toBeFalsy();
	});
});

test.describe('Toolbar keyboard access does not override block shortcuts', () => {
	test('Shift+Tab still outdents a nested list item', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('- Item', { delay: 10 });

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children[0]?.type).toBe('list_item');
		}).toPass({ timeout: 5_000 });

		await page.keyboard.press('Tab');
		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children[0]?.attrs?.indent).toBe(1);
		}).toPass({ timeout: 5_000 });

		await page.keyboard.press('Shift+Tab');
		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children[0]?.attrs?.indent).toBe(0);
		}).toPass({ timeout: 5_000 });

		expect(await focusedToolbarItem(editor)).toBeFalsy();
	});

	test('Shift+Tab still dedents inside a code block', async ({ editor, page }) => {
		await editor.focus();
		await page.keyboard.type('``` ', { delay: 10 });
		await page.keyboard.press('Tab');
		await page.keyboard.type('indented line', { delay: 10 });

		let json = await editor.getJSON();
		expect(json.children[0]?.children?.[0]?.text).toBe('\tindented line');

		await page.keyboard.press('Shift+Tab');

		json = await editor.getJSON();
		expect(json.children[0]?.children?.[0]?.text).toBe('indented line');
		expect(await focusedToolbarItem(editor)).toBeFalsy();
	});
});
