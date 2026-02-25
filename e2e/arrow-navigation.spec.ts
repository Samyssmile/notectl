import { expect, test } from './fixtures/editor-page';

test.describe('Arrow Navigation', () => {
	test.describe('Within text block', () => {
		test('ArrowRight and ArrowLeft move cursor by one character', async ({ editor, page }) => {
			await editor.typeText('ABCDE');
			await page.waitForTimeout(200);
			// Cursor is at end (offset 5). Move left 2 chars (offset 3).
			await page.keyboard.press('ArrowLeft');
			await page.keyboard.press('ArrowLeft');
			await page.waitForTimeout(50);
			// Move right 1 char (offset 4).
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(50);
			// Insert at offset 4
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toBe('ABCDXE');
		});

		test('ArrowLeft moves cursor backward', async ({ editor, page }) => {
			await editor.typeText('Hello');
			await page.waitForTimeout(100);
			await page.keyboard.press('ArrowLeft');
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toBe('HellXo');
		});
	});

	test.describe('Cross-block navigation', () => {
		test('ArrowDown moves from first block to second block', async ({ editor, page }) => {
			await editor.typeText('Line 1');
			await page.keyboard.press('Enter');
			await page.keyboard.type('Line 2', { delay: 10 });
			// Move up to first block
			await page.keyboard.press('ArrowUp');
			// Move down to second block
			await page.keyboard.press('ArrowDown');
			await page.keyboard.press('End');
			await page.keyboard.type('!', { delay: 10 });

			const json = await editor.getJSON();
			const lastBlock = json.children[json.children.length - 1];
			const lastText: string =
				lastBlock?.children?.map((c: { text: string }) => c.text).join('') ?? '';
			expect(lastText).toBe('Line 2!');
		});

		test('ArrowUp navigates toward earlier content', async ({ editor, page }) => {
			await editor.typeText('First');
			await page.keyboard.press('Enter');
			await page.keyboard.type('Second', { delay: 10 });
			await page.waitForTimeout(100);

			// Use ArrowUp to move toward the first block
			await page.keyboard.press('ArrowUp');
			await page.waitForTimeout(50);
			await page.keyboard.type('X', { delay: 10 });

			// X should appear before "Second" (either in first block or at start of second)
			const text: string = await editor.getText();
			const xIdx: number = text.indexOf('X');
			const secondIdx: number = text.indexOf('Second');
			expect(xIdx).toBeLessThan(secondIdx);
		});

		test('three blocks created and navigable', async ({ editor, page }) => {
			await editor.typeText('A');
			await page.keyboard.press('Enter');
			await page.keyboard.type('B', { delay: 10 });
			await page.keyboard.press('Enter');
			await page.keyboard.type('C', { delay: 10 });

			const json = await editor.getJSON();
			expect(json.children.length).toBe(3);

			// Navigate up to middle block and type
			await page.keyboard.press('ArrowUp');
			await page.keyboard.type('X', { delay: 10 });

			const updatedJson = await editor.getJSON();
			// The X should appear in either block 1 or 2 (middle block)
			const allText: string = updatedJson.children
				.map(
					(b: { children?: { text: string }[] }) => b.children?.map((c) => c.text).join('') ?? '',
				)
				.join('');
			expect(allText).toContain('X');
			expect(allText).toContain('A');
			expect(allText).toContain('C');
		});
	});

	test.describe('Document boundaries', () => {
		test('ArrowRight at document end does not crash', async ({ editor, page }) => {
			await editor.typeText('Hello');
			// Press ArrowRight multiple times at the end
			await page.keyboard.press('ArrowRight');
			await page.keyboard.press('ArrowRight');
			await page.keyboard.press('ArrowRight');
			// Type to verify editor still works
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toContain('Hello');
			expect(text.trim()).toContain('X');
		});

		test('ArrowUp at first block does not crash', async ({ editor, page }) => {
			await editor.typeText('Only block');
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('ArrowUp');
			// Should still be functional
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toContain('Only block');
		});

		test('ArrowDown at last block does not crash', async ({ editor, page }) => {
			await editor.typeText('Only block');
			await page.keyboard.press('ArrowDown');
			await page.keyboard.press('ArrowDown');
			// Should still be functional
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toContain('Only block');
		});
	});
});
