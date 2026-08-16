import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/editor-page';

/** 1×1 transparent PNG as a data URI (avoids external network requests). */
const DATA_URI_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Dispatches a paste event whose DataTransfer carries both an image file item
 * and clipboard string flavors, mirroring what Chromium on macOS exposes for
 * copies from Word/Excel (bitmap rendition + HTML) and for copied web images
 * (image file + `<img>` HTML).
 */
async function pasteFileWithHtml(
	page: Page,
	options: { readonly html: string; readonly text?: string },
): Promise<void> {
	await page.evaluate(
		async (args: { dataUri: string; html: string; text: string }) => {
			const editor = document.querySelector('notectl-editor');
			const content = editor?.shadowRoot?.querySelector('.notectl-content');
			if (!content) return;

			const blob = await (await fetch(args.dataUri)).blob();
			const file = new File([blob], 'rendition.png', { type: 'image/png' });

			const dt = new DataTransfer();
			dt.items.add(file);
			dt.setData('text/html', args.html);
			dt.setData('text/plain', args.text);

			const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
			Object.defineProperty(event, 'clipboardData', { value: dt, writable: false });
			content.dispatchEvent(event);
		},
		{ dataUri: DATA_URI_PNG, html: options.html, text: options.text ?? '' },
	);
}

test.describe('Paste precedence between HTML and file items (#216)', () => {
	test('Word-style clipboard (HTML + bitmap rendition) pastes as text, not as an image', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await pasteFileWithHtml(page, {
			html: '<meta charset="utf-8"><p>Hello <b>from Word</b></p>',
			text: 'Hello from Word',
		});

		await expect(page.locator('notectl-editor .notectl-content')).toContainText('Hello from Word');
		await expect(page.locator('notectl-editor figure.notectl-image')).toHaveCount(0);

		const json = await editor.getJSON();
		const imageBlocks = json.children.filter((b) => b.type === 'image');
		expect(imageBlocks).toHaveLength(0);
	});

	test('metadata-only HTML next to an image file falls back to the file handler', async ({
		editor,
		page,
	}) => {
		// Design tools put markup on the clipboard that carries only data
		// attributes: it wins the precedence check but pastes nothing, so the
		// bitmap must still land instead of the paste being silently discarded.
		await editor.focus();
		await pasteFileWithHtml(page, {
			html: '<meta charset="utf-8"><span data-metadata="…"></span><span data-buffer="abc"></span>',
		});

		const img = page.locator('notectl-editor .notectl-image__img');
		await expect(img).toBeVisible();
		const src: string | null = await img.getAttribute('src');
		expect(src).toMatch(/^blob:/);
	});

	test('copied web image (image-only HTML + file) still pastes through the file handler', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await pasteFileWithHtml(page, {
			html: '<meta charset="utf-8"><img src="https://example.com/photo.png" alt="">',
		});

		const img = page.locator('notectl-editor .notectl-image__img');
		await expect(img).toBeVisible();

		// The file handler owns the paste: the src is a blob URL for the pasted
		// file, not the remote URL from the wrapper markup.
		const src: string | null = await img.getAttribute('src');
		expect(src).toMatch(/^blob:/);
	});
});
