import { expect, test } from './fixtures/editor-page';

/**
 * Guards for #219: a press in the empty area below the last block must
 * not swallow the gesture on mousedown. Drag-selection started from the
 * empty area and non-primary buttons stay native; only an unmodified
 * primary click appends the trailing paragraph (covered in
 * code-block.spec.ts "clicking below code block creates paragraph").
 */
test.describe('Click below content', () => {
	test('dragging upward from the empty area below the content selects text', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await page.keyboard.type('first line of text', { delay: 10 });

		const contentBox = await editor.content.boundingBox();
		const blockBox = await editor.content.locator('[data-block-id]').first().boundingBox();
		expect(contentBox).not.toBeNull();
		expect(blockBox).not.toBeNull();
		if (!contentBox || !blockBox) return;

		// Press in the empty area near the bottom, drag up into the text.
		await page.mouse.move(
			contentBox.x + contentBox.width / 2,
			contentBox.y + contentBox.height - 10,
		);
		await page.mouse.down();
		await page.mouse.move(blockBox.x + 2, blockBox.y + blockBox.height / 2, { steps: 10 });
		await page.mouse.up();
		await page.waitForTimeout(100);

		const selectedText = await page.evaluate(() => window.getSelection()?.toString() ?? '');
		expect(selectedText).toContain('line of text');

		const json = await editor.getJSON();
		expect(json.children).toHaveLength(1);
	});

	test('right-clicking the empty area below the content does not insert a paragraph', async ({
		editor,
		page,
	}) => {
		await editor.focus();
		await page.keyboard.type('only line', { delay: 10 });

		const contentBox = await editor.content.boundingBox();
		expect(contentBox).not.toBeNull();
		if (!contentBox) return;

		await page.mouse.click(
			contentBox.x + contentBox.width / 2,
			contentBox.y + contentBox.height - 10,
			{ button: 'right' },
		);
		await page.waitForTimeout(100);

		const json = await editor.getJSON();
		expect(json.children).toHaveLength(1);
		expect(json.children[0]?.children?.[0]?.text).toBe('only line');
	});
});
