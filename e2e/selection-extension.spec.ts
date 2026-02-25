import { expect, test } from './fixtures/editor-page';

test.describe('Selection Extension', () => {
	test.describe('Programmatic selection replacement', () => {
		test('selecting a range and typing replaces the selected text', async ({ editor, page }) => {
			await editor.typeText('Hello World');
			await page.waitForTimeout(100);
			// Select "Hello" (offset 0 to 5) using the programmatic helper
			await editor.selectRange(0, 0, 5);
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toBe('X World');
		});

		test('selecting middle range and typing replaces correctly', async ({ editor, page }) => {
			await editor.typeText('ABCDE');
			await page.waitForTimeout(100);
			// Select "BCD" (offset 1 to 4)
			await editor.selectRange(0, 1, 4);
			await page.keyboard.type('X', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toBe('AXE');
		});
	});

	test.describe('Shift+ArrowLeft from end of text', () => {
		test('Shift+ArrowLeft selects backward and Delete removes', async ({ editor, page }) => {
			await editor.typeText('ABCDE');
			await page.waitForTimeout(200);
			// Select last 2 characters with Shift+ArrowLeft
			await page.keyboard.press('Shift+ArrowLeft');
			await page.keyboard.press('Shift+ArrowLeft');
			await page.waitForTimeout(100);
			await page.keyboard.press('Delete');
			const text: string = await editor.getText();
			expect(text.trim()).toBe('ABC');
		});
	});

	test.describe('Select All', () => {
		test('Ctrl+A selects all and typing replaces everything', async ({ editor, page }) => {
			await editor.typeText('First line');
			await page.keyboard.press('Enter');
			await page.keyboard.type('Second line', { delay: 10 });
			await page.waitForTimeout(100);
			await page.keyboard.press('Control+a');
			await page.keyboard.type('X', { delay: 10 });

			const text: string = await editor.getText();
			expect(text.trim()).toBe('X');
		});
	});

	test.describe('Shift+Arrow cross-block', () => {
		test('Shift+ArrowDown extends selection into next block', async ({ editor, page }) => {
			await editor.typeText('First');
			await page.keyboard.press('Enter');
			await page.keyboard.type('Second', { delay: 10 });
			await page.waitForTimeout(100);

			// Move cursor to first block
			await page.keyboard.press('ArrowUp');
			await page.keyboard.press('Home');
			await page.waitForTimeout(100);

			// Extend selection downward across block boundary
			await page.keyboard.press('Shift+ArrowDown');
			await page.waitForTimeout(100);

			// Type to replace selection — should replace at least the first block's content
			await page.keyboard.type('R', { delay: 10 });
			const text: string = await editor.getText();
			// "First" should be replaced; some portion of "Second" may remain
			expect(text).not.toContain('First');
			expect(text).toContain('R');
		});

		test('Shift+ArrowUp extends selection into previous block', async ({ editor, page }) => {
			await editor.typeText('First');
			await page.keyboard.press('Enter');
			await page.keyboard.type('Second', { delay: 10 });
			await page.waitForTimeout(100);

			// Cursor is at end of "Second"; extend selection upward
			await page.keyboard.press('Shift+ArrowUp');
			await page.waitForTimeout(100);

			// Type to replace — should remove at least part of "Second"
			await page.keyboard.type('R', { delay: 10 });
			const text: string = await editor.getText();
			expect(text).not.toContain('Second');
			expect(text).toContain('R');
		});
	});

	test.describe('Shift+Home/End', () => {
		test('Shift+Home from end selects entire line', async ({ editor, page }) => {
			await editor.typeText('Hello');
			await page.waitForTimeout(200);
			await page.keyboard.press('Shift+Home');
			await page.waitForTimeout(100);
			await page.keyboard.type('R', { delay: 10 });
			const text: string = await editor.getText();
			expect(text.trim()).toBe('R');
		});
	});
});
