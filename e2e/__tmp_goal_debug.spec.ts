import { expect, test } from './fixtures/editor-page';

test('debug goal-column undo grouping', async ({ editor, page }) => {
	await editor.typeText('Short');
	await page.keyboard.press('Enter');
	await editor.typeText('A much longer paragraph here');
	await page.keyboard.press('Enter');
	await editor.typeText('Medium text');
	await page.waitForTimeout(100);

	await page.keyboard.press('Control+Home');
	await page.waitForTimeout(50);
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await page.waitForTimeout(50);

	await editor.waitForUndoGroup();

	await page.keyboard.type('X', { delay: 10 });
	let text: string = await editor.getText();
	expect(text).toContain('ShoXrt');

	await page.keyboard.press('Control+z');
	await page.waitForTimeout(50);

	text = await editor.getText();
	expect(text).toContain('Medium text');

	await page.keyboard.press('ArrowDown');
	await page.waitForTimeout(50);
	await page.keyboard.type('Y', { delay: 10 });
	text = await editor.getText();
	const secondLine: string = text.split('\n')[1] ?? '';
	const yPos: number = secondLine.indexOf('Y');
	expect(yPos).toBeGreaterThanOrEqual(0);
	expect(yPos).toBeLessThanOrEqual(5);
});
