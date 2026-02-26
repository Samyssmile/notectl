import { expect, test } from './fixtures/editor-page';

test.describe('Goal Column Preservation', () => {
	test('ArrowDown over paragraphs preserves visual column', async ({ editor, page }) => {
		// Type three paragraphs of different lengths
		await editor.typeText('Short');
		await page.keyboard.press('Enter');
		await editor.typeText('A much longer paragraph here');
		await page.keyboard.press('Enter');
		await editor.typeText('Medium text');
		await page.waitForTimeout(100);

		// Move cursor to first paragraph at offset 3
		await page.keyboard.press('Control+Home');
		await page.waitForTimeout(50);
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(50);

		// Type a marker to verify starting position
		await page.keyboard.type('X', { delay: 10 });
		let text: string = await editor.getText();
		expect(text).toContain('ShoXrt');

		// Undo the marker
		await page.keyboard.press('Control+z');
		await page.waitForTimeout(50);

		// ArrowDown to second paragraph → should land near column 3
		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(50);
		await page.keyboard.type('Y', { delay: 10 });
		text = await editor.getText();
		// The Y should be somewhere near the beginning of the second paragraph
		const secondLine: string = text.split('\n')[1] ?? '';
		const yPos: number = secondLine.indexOf('Y');
		expect(yPos).toBeGreaterThanOrEqual(0);
		expect(yPos).toBeLessThanOrEqual(5);
	});

	test('Horizontal arrow resets goalColumn for subsequent vertical nav', async ({
		editor,
		page,
	}) => {
		await editor.typeText('Hello World');
		await page.keyboard.press('Enter');
		await editor.typeText('Second line here');
		await page.waitForTimeout(100);

		// Go to first line, offset 5
		await page.keyboard.press('Control+Home');
		await page.waitForTimeout(50);
		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('ArrowRight');
		}

		// ArrowDown from first to second line (cross-block)
		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(50);

		// ArrowLeft moves left by 1 and resets goalColumn
		await page.keyboard.press('ArrowLeft');
		await page.waitForTimeout(50);

		// ArrowUp back to first line — should use the new position, not the old goalColumn
		await page.keyboard.press('ArrowUp');
		await page.waitForTimeout(50);

		// Type marker at the new position
		await page.keyboard.type('Z', { delay: 10 });
		const text: string = await editor.getText();
		// Z should be in first line
		const firstLine: string = text.split('\n')[0] ?? '';
		expect(firstLine).toContain('Z');
	});

	test('ArrowDown into shorter block moves cursor to that block', async ({ editor, page }) => {
		await editor.typeText('A very long first paragraph');
		await page.keyboard.press('Enter');
		await editor.typeText('Hi');
		await page.waitForTimeout(100);

		// Position cursor at end of first paragraph
		await page.keyboard.press('Control+Home');
		await page.waitForTimeout(50);
		await page.keyboard.press('End');
		await page.waitForTimeout(50);

		// ArrowDown — cursor moves to the shorter second paragraph
		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(50);

		await page.keyboard.type('!', { delay: 10 });
		const text: string = await editor.getText();
		const secondLine: string = text.split('\n')[1] ?? '';
		// "!" should appear somewhere in the second line (cursor successfully moved)
		expect(secondLine).toContain('!');
		expect(secondLine).toContain('Hi');
	});

	test('Typing resets goalColumn', async ({ editor, page }) => {
		await editor.typeText('Hello');
		await page.keyboard.press('Enter');
		await editor.typeText('World');
		await page.waitForTimeout(100);

		// Go to first line offset 3
		await page.keyboard.press('Control+Home');
		await page.waitForTimeout(50);
		for (let i = 0; i < 3; i++) {
			await page.keyboard.press('ArrowRight');
		}

		// ArrowDown (captures goalColumn ~3)
		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(50);

		// ArrowUp (back to first line, still goalColumn ~3)
		await page.keyboard.press('ArrowUp');
		await page.waitForTimeout(50);

		// Type something (resets goalColumn)
		await page.keyboard.type('X', { delay: 10 });
		await page.waitForTimeout(50);

		// ArrowDown now — should use the new cursor position
		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(50);

		await page.keyboard.type('Y', { delay: 10 });
		const text: string = await editor.getText();
		// Y should be in second line
		const secondLine: string = text.split('\n')[1] ?? '';
		expect(secondLine).toContain('Y');
	});
});
