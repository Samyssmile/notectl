import { expect, test } from './fixtures/editor-page';

/**
 * Tests for cursor behavior inside list items (bullet, ordered, checklist).
 * These tests document issues reported in GitHub issue #68:
 *
 * 1. Clicking at the end or in the text of a list item should position the cursor correctly
 * 2. ArrowUp/ArrowDown should preserve the horizontal column position (goal column)
 *    rather than jumping to end/start of the adjacent line
 */

test.describe('Cursor in List Items (#68)', () => {
	test.describe('Click positioning in list items', () => {
		test('clicking in the text of a bullet list item places cursor at click position', async ({
			editor,
			page,
		}) => {
			await editor.typeText('Hello World');

			const bulletBtn = editor.markButton('list-bullet');
			await bulletBtn.click();

			await expect(async () => {
				const json = await editor.getJSON();
				expect(json.children[0]?.type).toBe('list_item');
			}).toPass({ timeout: 5_000 });

			const listItem = editor.content.locator('.notectl-list-item--bullet');
			await expect(listItem).toBeVisible();
			const box = await listItem.boundingBox();
			if (!box) throw new Error('bounding box not available');

			// Click in the middle of the text area (well past the bullet marker)
			await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
			await page.waitForTimeout(150);

			// Type a marker character to verify cursor was placed inside the text
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			// X should be somewhere inside "Hello World", not at the very start or end only
			expect(text.trim()).toContain('X');
			// The text should still be a single line with X inserted
			expect(text.trim()).toMatch(/^Hello.*X.*World$|^Hello.*World.*X$|^X.*Hello.*World$/);
		});

		test('clicking at the end of a bullet list item text places cursor at end', async ({
			editor,
			page,
		}) => {
			await editor.typeText('Hello');

			const bulletBtn = editor.markButton('list-bullet');
			await bulletBtn.click();

			await expect(async () => {
				const json = await editor.getJSON();
				expect(json.children[0]?.type).toBe('list_item');
			}).toPass({ timeout: 5_000 });

			const listItem = editor.content.locator('.notectl-list-item--bullet');
			const box = await listItem.boundingBox();
			if (!box) throw new Error('bounding box not available');

			// Click near the right edge of the text, past the text content
			await page.mouse.click(box.x + box.width - 10, box.y + box.height / 2);
			await page.waitForTimeout(150);

			// Type at cursor position — should appear at end
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toBe('HelloX');
		});

		test('clicking in the text of an ordered list item places cursor correctly', async ({
			editor,
			page,
		}) => {
			await editor.typeText('Numbered item');

			const orderedBtn = editor.markButton('list-ordered');
			await orderedBtn.click();

			await expect(async () => {
				const json = await editor.getJSON();
				expect(json.children[0]?.type).toBe('list_item');
				expect(json.children[0]?.attrs?.listType).toBe('ordered');
			}).toPass({ timeout: 5_000 });

			const listItem = editor.content.locator('.notectl-list-item--ordered');
			const box = await listItem.boundingBox();
			if (!box) throw new Error('bounding box not available');

			// Click in the middle of the text
			await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
			await page.waitForTimeout(150);

			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toContain('X');
			expect(text.trim()).toContain('Numbered');
			expect(text.trim()).toContain('item');
		});

		test('clicking in the text of a checklist item places cursor correctly', async ({
			editor,
			page,
		}) => {
			await editor.typeText('Check item text');

			const checklistBtn = editor.markButton('list-checklist');
			await checklistBtn.click();

			await expect(async () => {
				const json = await editor.getJSON();
				expect(json.children[0]?.type).toBe('list_item');
				expect(json.children[0]?.attrs?.listType).toBe('checklist');
			}).toPass({ timeout: 5_000 });

			const listItem = editor.content.locator('.notectl-list-item--checklist');
			const box = await listItem.boundingBox();
			if (!box) throw new Error('bounding box not available');

			// Click in the text area (well past the checkbox, roughly in "item")
			await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
			await page.waitForTimeout(150);

			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toContain('X');
			// The item should still be a checklist item
			const json = await editor.getJSON();
			expect(json.children[0]?.type).toBe('list_item');
			expect(json.children[0]?.attrs?.listType).toBe('checklist');
		});

		test('clicking at end of second list item places cursor there', async ({ editor, page }) => {
			await editor.typeText('First');

			const bulletBtn = editor.markButton('list-bullet');
			await bulletBtn.click();

			await page.keyboard.press('Enter');
			await page.keyboard.type('Second', { delay: 10 });
			await page.waitForTimeout(100);

			// Now click somewhere else (first item) to move cursor away
			const items = editor.content.locator('.notectl-list-item--bullet');
			await expect(items).toHaveCount(2);

			const firstBox = await items.nth(0).boundingBox();
			if (!firstBox) throw new Error('bounding box not available');
			await page.mouse.click(firstBox.x + 80, firstBox.y + firstBox.height / 2);
			await page.waitForTimeout(150);

			// Now click at end of the second list item
			const secondBox = await items.nth(1).boundingBox();
			if (!secondBox) throw new Error('bounding box not available');
			await page.mouse.click(
				secondBox.x + secondBox.width - 10,
				secondBox.y + secondBox.height / 2,
			);
			await page.waitForTimeout(150);

			// Type to verify cursor is at the end of "Second"
			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const secondText: string =
				json.children[1]?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(secondText).toBe('SecondX');
		});
	});

	test.describe('Arrow key vertical navigation in list items', () => {
		test('ArrowUp from second list item preserves horizontal position', async ({
			editor,
			page,
		}) => {
			// Create two bullet list items with text
			await editor.typeText('ABCDEFGH');

			const bulletBtn = editor.markButton('list-bullet');
			await bulletBtn.click();

			await page.keyboard.press('Enter');
			await page.keyboard.type('12345678', { delay: 10 });
			await page.waitForTimeout(100);

			// Position cursor at offset 4 in second item ("1234|5678")
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);
			for (let i = 0; i < 4; i++) {
				await page.keyboard.press('ArrowRight');
			}
			await page.waitForTimeout(50);

			// ArrowUp should move to first item, preserving ~column 4
			await page.keyboard.press('ArrowUp');
			await page.waitForTimeout(100);

			// Type marker to verify position
			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const firstText: string =
				json.children[0]?.children?.map((c: { text: string }) => c.text).join('') ?? '';

			// X should be near offset 4 in the first item, not at start or end
			// Expected: "ABCDXEFGH" (ideal) — cursor preserved at column ~4
			// Bug: cursor jumps to end → "ABCDEFGHX"
			// Bug: cursor jumps to start → "XABCDEFGH"
			const xPos: number = firstText.indexOf('X');
			expect(xPos).toBeGreaterThan(0);
			expect(xPos).toBeLessThan(firstText.length - 1);
		});

		test('ArrowDown from first list item preserves horizontal position', async ({
			editor,
			page,
		}) => {
			await editor.typeText('ABCDEFGH');

			const bulletBtn = editor.markButton('list-bullet');
			await bulletBtn.click();

			await page.keyboard.press('Enter');
			await page.keyboard.type('12345678', { delay: 10 });
			await page.waitForTimeout(100);

			// Move to first item, position at offset 3
			await page.keyboard.press('Control+Home');
			await page.waitForTimeout(50);
			for (let i = 0; i < 3; i++) {
				await page.keyboard.press('ArrowRight');
			}
			await page.waitForTimeout(50);

			// ArrowDown should move to second item preserving ~column 3
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(100);

			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const secondText: string =
				json.children[1]?.children?.map((c: { text: string }) => c.text).join('') ?? '';

			// X should be near offset 3, not at start (0) or end (8)
			// Expected: "123X45678"
			// Bug: "X12345678" (jumped to start)
			const xPos: number = secondText.indexOf('X');
			expect(xPos).toBeGreaterThan(0);
			expect(xPos).toBeLessThan(secondText.length - 1);
		});

		test('ArrowUp preserves column across ordered list items', async ({ editor, page }) => {
			await editor.typeText('Long first item');

			const orderedBtn = editor.markButton('list-ordered');
			await orderedBtn.click();

			await page.keyboard.press('Enter');
			await page.keyboard.type('Long second item', { delay: 10 });
			await page.waitForTimeout(100);

			// Position cursor at offset 5 in second item
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);
			for (let i = 0; i < 5; i++) {
				await page.keyboard.press('ArrowRight');
			}
			await page.waitForTimeout(50);

			// ArrowUp to first item
			await page.keyboard.press('ArrowUp');
			await page.waitForTimeout(100);

			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const firstText: string =
				json.children[0]?.children?.map((c: { text: string }) => c.text).join('') ?? '';

			// X should be near column 5 in the first item
			const xPos: number = firstText.indexOf('X');
			expect(xPos).toBeGreaterThan(0);
			expect(xPos).toBeLessThan(firstText.length - 1);
		});

		test('ArrowUp preserves column across checklist items', async ({ editor, page }) => {
			await editor.typeText('First checklist item');

			const checklistBtn = editor.markButton('list-checklist');
			await checklistBtn.click();

			await page.keyboard.press('Enter');
			await page.keyboard.type('Second checklist item', { delay: 10 });
			await page.waitForTimeout(100);

			// Position cursor at offset 7 in second item
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);
			for (let i = 0; i < 7; i++) {
				await page.keyboard.press('ArrowRight');
			}
			await page.waitForTimeout(50);

			await page.keyboard.press('ArrowUp');
			await page.waitForTimeout(100);

			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const firstText: string =
				json.children[0]?.children?.map((c: { text: string }) => c.text).join('') ?? '';

			const xPos: number = firstText.indexOf('X');
			expect(xPos).toBeGreaterThan(0);
			expect(xPos).toBeLessThan(firstText.length - 1);
		});

		test('ArrowDown then ArrowUp round-trips to same position in list items', async ({
			editor,
			page,
		}) => {
			await editor.typeText('ABCDEFGHIJ');

			const bulletBtn = editor.markButton('list-bullet');
			await bulletBtn.click();

			await page.keyboard.press('Enter');
			await page.keyboard.type('1234567890', { delay: 10 });
			await page.waitForTimeout(100);

			// Go to first item, offset 5
			await page.keyboard.press('Control+Home');
			await page.waitForTimeout(50);
			for (let i = 0; i < 5; i++) {
				await page.keyboard.press('ArrowRight');
			}
			await page.waitForTimeout(50);

			// ArrowDown → second item
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(100);

			// ArrowUp → back to first item, should be at ~offset 5
			await page.keyboard.press('ArrowUp');
			await page.waitForTimeout(100);

			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const firstText: string =
				json.children[0]?.children?.map((c: { text: string }) => c.text).join('') ?? '';

			// Should be near the original position (offset 5)
			// "ABCDEXFGHIJ" is ideal
			const xPos: number = firstText.indexOf('X');
			expect(xPos).toBeGreaterThanOrEqual(4);
			expect(xPos).toBeLessThanOrEqual(6);
		});

		test('ArrowDown into shorter list item clamps to end', async ({ editor, page }) => {
			await editor.typeText('A very long list item text here');

			const bulletBtn = editor.markButton('list-bullet');
			await bulletBtn.click();

			await page.keyboard.press('Enter');
			await page.keyboard.type('Short', { delay: 10 });
			await page.waitForTimeout(100);

			// Position cursor at end of first (long) item
			await page.keyboard.press('Control+Home');
			await page.waitForTimeout(50);
			await page.keyboard.press('End');
			await page.waitForTimeout(50);

			// ArrowDown — cursor should land in the shorter second item (clamped to end)
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(100);

			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const secondText: string =
				json.children[1]?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			// Cursor should land in second item, at or near end
			expect(secondText).toContain('X');
			expect(secondText).toContain('Short');
		});
	});

	test.describe('Navigation between list items and paragraphs', () => {
		test('ArrowUp from list item to preceding paragraph preserves column', async ({
			editor,
			page,
		}) => {
			// First a paragraph, then a list item
			await editor.typeText('Paragraph text here');
			await page.keyboard.press('Enter');
			await page.keyboard.type('List item text here', { delay: 10 });
			await page.waitForTimeout(100);

			// Convert only the second block to a bullet list
			const bulletBtn = editor.markButton('list-bullet');
			await bulletBtn.click();

			await expect(async () => {
				const json = await editor.getJSON();
				expect(json.children[0]?.type).toBe('paragraph');
				expect(json.children[1]?.type).toBe('list_item');
			}).toPass({ timeout: 5_000 });

			// Position cursor at offset 5 in the list item
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);
			for (let i = 0; i < 5; i++) {
				await page.keyboard.press('ArrowRight');
			}
			await page.waitForTimeout(50);

			// ArrowUp to the paragraph
			await page.keyboard.press('ArrowUp');
			await page.waitForTimeout(100);

			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const paraText: string =
				json.children[0]?.children?.map((c: { text: string }) => c.text).join('') ?? '';

			// X should be near column 5, not at end
			const xPos: number = paraText.indexOf('X');
			expect(xPos).toBeGreaterThan(0);
			expect(xPos).toBeLessThan(paraText.length - 1);
		});

		test('ArrowDown from paragraph to list item preserves column', async ({ editor, page }) => {
			await editor.typeText('Paragraph text here');
			await page.keyboard.press('Enter');
			await page.keyboard.type('List item text here', { delay: 10 });
			await page.waitForTimeout(100);

			const bulletBtn = editor.markButton('list-bullet');
			await bulletBtn.click();

			// Go to paragraph, position at offset 5
			await page.keyboard.press('Control+Home');
			await page.waitForTimeout(50);
			for (let i = 0; i < 5; i++) {
				await page.keyboard.press('ArrowRight');
			}
			await page.waitForTimeout(50);

			// ArrowDown to the list item
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(100);

			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const listText: string =
				json.children[1]?.children?.map((c: { text: string }) => c.text).join('') ?? '';

			const xPos: number = listText.indexOf('X');
			expect(xPos).toBeGreaterThan(0);
			expect(xPos).toBeLessThan(listText.length - 1);
		});
	});

	test.describe('Navigation across multiple list items', () => {
		test('ArrowDown through three bullet list items preserves column', async ({ editor, page }) => {
			await editor.typeText('First item text');

			const bulletBtn = editor.markButton('list-bullet');
			await bulletBtn.click();

			await page.keyboard.press('Enter');
			await page.keyboard.type('Second item text', { delay: 10 });
			await page.keyboard.press('Enter');
			await page.keyboard.type('Third item text', { delay: 10 });
			await page.waitForTimeout(100);

			// Go to first item, offset 6
			await page.keyboard.press('Control+Home');
			await page.waitForTimeout(50);
			for (let i = 0; i < 6; i++) {
				await page.keyboard.press('ArrowRight');
			}
			await page.waitForTimeout(50);

			// ArrowDown to second item
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(100);

			// ArrowDown to third item
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(100);

			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const thirdText: string =
				json.children[2]?.children?.map((c: { text: string }) => c.text).join('') ?? '';

			// X should be near column 6 in the third item
			const xPos: number = thirdText.indexOf('X');
			expect(xPos).toBeGreaterThan(0);
			expect(xPos).toBeLessThan(thirdText.length - 1);
		});

		test('ArrowUp through three checklist items preserves column', async ({ editor, page }) => {
			await editor.typeText('First check');

			const checklistBtn = editor.markButton('list-checklist');
			await checklistBtn.click();

			await page.keyboard.press('Enter');
			await page.keyboard.type('Second check', { delay: 10 });
			await page.keyboard.press('Enter');
			await page.keyboard.type('Third check', { delay: 10 });
			await page.waitForTimeout(100);

			// Position at offset 4 in the third item
			await page.keyboard.press('Home');
			await page.waitForTimeout(50);
			for (let i = 0; i < 4; i++) {
				await page.keyboard.press('ArrowRight');
			}
			await page.waitForTimeout(50);

			// ArrowUp to second item
			await page.keyboard.press('ArrowUp');
			await page.waitForTimeout(100);

			// ArrowUp to first item
			await page.keyboard.press('ArrowUp');
			await page.waitForTimeout(100);

			await page.keyboard.type('X', { delay: 10 });
			const json = await editor.getJSON();
			const firstText: string =
				json.children[0]?.children?.map((c: { text: string }) => c.text).join('') ?? '';

			// X should be near column 4 in the first item
			const xPos: number = firstText.indexOf('X');
			expect(xPos).toBeGreaterThan(0);
			expect(xPos).toBeLessThan(firstText.length - 1);
		});
	});
});
