import { expect, test } from './fixtures/editor-page';

/** 1×1 transparent PNG as a data URI (avoids external network requests). */
const DATA_URI_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

type JsonChild = { type: string; children?: { text: string }[] };

/** Joins the text of a block's inline children. */
function blockText(block: JsonChild | undefined): string {
	return (block?.children ?? []).map((c) => c.text).join('');
}

/**
 * Regression for issue #163. After inserting a void block (image, display
 * formula) the editor leaves a node selection on that block, which already owns
 * a trailing empty paragraph as its escape line. Typing the first character must
 * land in that trailing paragraph rather than spawning a second one, so the
 * document stays `[image, paragraph]` and not `[image, paragraph, paragraph]`.
 */
test.describe('Typing after a node-selected void block (issue #163)', () => {
	test('typing after an inserted image reuses the trailing paragraph', async ({ editor, page }) => {
		await editor.focus();

		await editor.markButton('image').click();
		const urlInput = page.locator('notectl-editor input[aria-label="Image URL"]');
		await urlInput.waitFor({ state: 'visible' });
		await urlInput.fill(DATA_URI_PNG);
		await page.locator('notectl-editor button[aria-label="Insert image"]').click();

		const figure = page.locator('notectl-editor figure.notectl-image');
		await figure.waitFor({ state: 'visible', timeout: 5000 });

		// The image is node-selected and the editor focused after insertion, so the
		// typed text reaches the editor with no extra gesture (matches the report).
		await page.keyboard.type('caption', { delay: 10 });

		const json: { children: JsonChild[] } = await editor.getJSON();
		expect(json.children.map((c) => c.type)).toEqual(['image', 'paragraph']);
		expect(blockText(json.children[1])).toBe('caption');
	});
});
