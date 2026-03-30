import { expect, test } from './fixtures/editor-page';

test.describe('ArrowUp preserves cursor column position', () => {
	test('ArrowDown then ArrowUp without intermediate typing preserves column', async ({
		editor,
		page,
	}) => {
		// Exact reproduction of the bug report:
		// Two identical lines, cursor at "my|", ArrowDown then ArrowUp
		await editor.typeText('this is my list item');
		await page.keyboard.press('Enter');
		await page.keyboard.type('this is my list item', { delay: 10 });
		await page.waitForTimeout(100);

		// Move cursor to first paragraph, position after 'my' (offset 10)
		await page.keyboard.press('Control+Home');
		await page.waitForTimeout(50);
		for (let i = 0; i < 10; i++) {
			await page.keyboard.press('ArrowRight');
		}
		await page.waitForTimeout(50);

		// ArrowDown → cursor should land at offset 10 in second paragraph
		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(100);

		// ArrowUp → cursor should return to offset 10 in first paragraph
		// BUG: cursor jumps to end of line instead of staying at column 10
		await page.keyboard.press('ArrowUp');
		await page.waitForTimeout(100);

		// Verify: insert marker in first paragraph
		await page.keyboard.type('Z', { delay: 10 });
		const text: string = await editor.getText();
		const firstLine: string = text.split('\n')[0] ?? '';
		const zPos: number = firstLine.indexOf('Z');

		// Expected: Z at offset 10 (after 'my'), NOT at end of line (offset 20)
		expect(zPos).toBeGreaterThanOrEqual(9);
		expect(zPos).toBeLessThanOrEqual(11);
	});

	test('ArrowUp from mid-block preserves column without prior ArrowDown', async ({
		editor,
		page,
	}) => {
		await editor.typeText('abcdefghij');
		await page.keyboard.press('Enter');
		await page.keyboard.type('abcdefghij', { delay: 10 });
		await page.waitForTimeout(100);

		// Place cursor at offset 5 in second paragraph
		await page.keyboard.press('End');
		await page.waitForTimeout(50);
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('ArrowLeft');
		}
		await page.waitForTimeout(50);

		// ArrowUp → should land at offset 5 in first paragraph
		await page.keyboard.press('ArrowUp');
		await page.waitForTimeout(100);

		// Verify position
		await page.keyboard.type('X', { delay: 10 });
		const text: string = await editor.getText();
		const firstLine: string = text.split('\n')[0] ?? '';
		const xPos: number = firstLine.indexOf('X');
		expect(xPos).toBeGreaterThanOrEqual(4);
		expect(xPos).toBeLessThanOrEqual(6);
	});

	test('repeated ArrowDown/ArrowUp round-trip preserves column', async ({ editor, page }) => {
		await editor.typeText('Hello World Foo');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Hello World Foo', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('Hello World Foo', { delay: 10 });
		await page.waitForTimeout(100);

		// Position cursor at offset 5 in first paragraph
		await page.keyboard.press('Control+Home');
		await page.waitForTimeout(50);
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('ArrowRight');
		}
		await page.waitForTimeout(50);

		// ArrowDown twice to third paragraph
		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(50);
		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(50);

		// ArrowUp twice back to first paragraph
		await page.keyboard.press('ArrowUp');
		await page.waitForTimeout(50);
		await page.keyboard.press('ArrowUp');
		await page.waitForTimeout(100);

		// Cursor should be back at offset 5 in first paragraph
		await page.keyboard.type('Z', { delay: 10 });
		const text: string = await editor.getText();
		const firstLine: string = text.split('\n')[0] ?? '';
		const zPos: number = firstLine.indexOf('Z');
		expect(zPos).toBeGreaterThanOrEqual(4);
		expect(zPos).toBeLessThanOrEqual(6);
	});

	test('ArrowDown then ArrowUp with list items preserves column', async ({ editor, page }) => {
		// Test with actual bullet list items
		await editor.typeText('this is my list item');

		const bulletBtn = editor.markButton('list-bullet');
		await bulletBtn.click();

		await expect(async () => {
			const json = await editor.getJSON();
			expect(json.children[0]?.type).toBe('list_item');
		}).toPass({ timeout: 5_000 });

		await page.keyboard.press('Enter');
		await page.keyboard.type('this is my list item', { delay: 10 });
		await page.waitForTimeout(100);

		// Position cursor at offset 10 in first list item (after 'my')
		await page.keyboard.press('Control+Home');
		await page.waitForTimeout(50);
		for (let i = 0; i < 10; i++) {
			await page.keyboard.press('ArrowRight');
		}
		await page.waitForTimeout(50);

		// ArrowDown to second list item
		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(100);

		// ArrowUp back to first list item — should preserve column
		await page.keyboard.press('ArrowUp');
		await page.waitForTimeout(100);

		// Verify position
		await page.keyboard.type('Z', { delay: 10 });
		const json = await editor.getJSON();
		const firstText: string = editor.getBlockText(json, 0);

		// Expected: "this is myZ list item" (offset 10)
		// Bug: "this is my list itemZ" (end of line)
		const zPos: number = firstText.indexOf('Z');
		expect(zPos).toBeGreaterThanOrEqual(9);
		expect(zPos).toBeLessThanOrEqual(11);
	});

	test('click-positioned cursor ArrowDown then ArrowUp preserves column', async ({
		editor,
		page,
	}) => {
		// Test with mouse click positioning (closer to real user behavior)
		// Use longer text to ensure click at 30% width lands within text bounds
		await editor.typeText('this is my list item and some extra text to fill the line');
		await page.keyboard.press('Enter');
		await page.keyboard.type('this is my list item and some extra text to fill the line', {
			delay: 10,
		});
		await page.waitForTimeout(100);

		// Click in the first ~30% of the block to land within text
		const blocks = editor.content.locator('[data-block-id]');
		const firstBlock = blocks.nth(0);
		const box = await firstBlock.boundingBox();
		if (!box) throw new Error('bounding box not available');

		await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
		await page.waitForTimeout(150);

		// Verify cursor is NOT at start or end by typing and checking
		await page.keyboard.type('X', { delay: 10 });
		let text: string = await editor.getText();
		let firstLine: string = text.split('\n')[0] ?? '';
		const xPos: number = firstLine.indexOf('X');
		expect(xPos).toBeGreaterThan(2);
		expect(xPos).toBeLessThan(firstLine.length - 2);

		// Undo the X marker
		await page.keyboard.press('Control+z');
		await page.waitForTimeout(100);

		// ArrowDown to second paragraph
		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(100);

		// ArrowUp back to first paragraph
		await page.keyboard.press('ArrowUp');
		await page.waitForTimeout(100);

		// Type marker to check position
		await page.keyboard.type('Z', { delay: 10 });
		text = await editor.getText();
		firstLine = text.split('\n')[0] ?? '';
		const zPos: number = firstLine.indexOf('Z');

		// Cursor should be near the same position as the original click, NOT at end
		expect(zPos).toBeGreaterThan(2);
		expect(zPos).toBeLessThan(firstLine.length - 2);
	});
});
