import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/editor-page';

/**
 * Issue #176: keyboard shortcuts must work on non-Latin keyboard layouts.
 *
 * Playwright cannot switch the OS keyboard layout, so a Russian (JCUKEN)
 * layout is simulated by dispatching synthetic `KeyboardEvent`s where
 * `event.key` carries the Cyrillic character the physical key would produce
 * while `event.code` keeps the layout-independent US-QWERTY position
 * (e.g. the physical `A` key reports `key: 'ф', code: 'KeyA'`).
 *
 * These synthetic events are `isTrusted: false`; the KeyboardHandler does not
 * gate on trust, so the physical-key fallback resolves them like real input.
 * Layout-independent keys (Delete) use real Playwright key presses.
 */

/** Dispatches a synthetic keydown on the editor content (simulating a key as a given layout reports it). */
async function dispatchKey(
	page: Page,
	key: string,
	code: string,
	mods: { ctrlKey?: boolean; shiftKey?: boolean } = {},
): Promise<void> {
	await page.evaluate(
		({ key, code, mods }) => {
			const editor = document.querySelector('notectl-editor');
			const content = editor?.shadowRoot?.querySelector('.notectl-content');
			if (!content) throw new Error('editor content not found');
			const event = new KeyboardEvent('keydown', {
				key,
				code,
				ctrlKey: mods.ctrlKey ?? false,
				shiftKey: mods.shiftKey ?? false,
				bubbles: true,
				cancelable: true,
			});
			content.dispatchEvent(event);
		},
		{ key, code, mods },
	);
}

test.describe('Keyboard shortcuts on non-Latin layouts (#176)', () => {
	test('Cyrillic Ctrl+A selects all, Delete clears, Cyrillic Ctrl+Z restores', async ({
		editor,
		page,
	}) => {
		await editor.typeText('Hello World');
		await editor.waitForUndoGroup();

		// Ctrl+A on a Russian layout: physical A key reports key='ф', code='KeyA'.
		await dispatchKey(page, 'ф', 'KeyA', { ctrlKey: true });
		// Delete is layout-independent; with a real selection it clears the document.
		await page.keyboard.press('Delete');

		await expect(async () => {
			expect((await editor.getText()).trim()).toBe('');
		}).toPass({ timeout: 5_000 });

		// Ctrl+Z on a Russian layout: physical Z key reports key='я', code='KeyZ'.
		await dispatchKey(page, 'я', 'KeyZ', { ctrlKey: true });

		await expect(async () => {
			expect((await editor.getText()).trim()).toBe('Hello World');
		}).toPass({ timeout: 5_000 });
	});

	test('Cyrillic Ctrl+Z undoes typing', async ({ editor, page }) => {
		await editor.typeText('Hallo');
		await editor.waitForUndoGroup();

		await dispatchKey(page, 'я', 'KeyZ', { ctrlKey: true });

		await expect(async () => {
			expect((await editor.getText()).trim()).toBe('');
		}).toPass({ timeout: 5_000 });
	});

	test('Cyrillic Ctrl+B applies bold via plugin keymap', async ({ editor, page }) => {
		await editor.typeText('bold');
		await page.keyboard.press('Control+a');

		// Ctrl+B on a Russian layout: physical B key reports key='и', code='KeyB'.
		await dispatchKey(page, 'и', 'KeyB', { ctrlKey: true });

		await expect(async () => {
			expect(await editor.getContentHTML()).toContain('<strong>');
		}).toPass({ timeout: 5_000 });
	});

	test('Cyrillic Ctrl+Shift+. toggles blockquote (shifted-punctuation binding)', async ({
		editor,
		page,
	}) => {
		await editor.typeText('Quote me');

		// Mod-Shift-> (blockquote) is bound to the *shifted* glyph. On a Russian
		// layout the physical Period key reports a Cyrillic char, so the binding
		// resolves through the physical position plus its US-QWERTY shifted glyph.
		await dispatchKey(page, 'Ю', 'Period', { ctrlKey: true, shiftKey: true });

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children[0]?.type).toBe('blockquote');
		}).toPass({ timeout: 5_000 });
	});
});
