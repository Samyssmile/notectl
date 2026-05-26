/**
 * Regression test for GitHub issue #130.
 * A selection spanning multiple blocks where one block is empty must still
 * correctly report the mark as active and allow toggling it off.
 *
 * Document layout:
 *   line 1
 *   (empty)
 *   line 3
 *   line 4
 *
 * The selection covers "line 1" through end of "line 3" (3 blocks, middle one empty).
 */

import { expect, test } from './fixtures/editor-page';

test.describe('Issue #130, formatting across empty line', () => {
	test('Bold across 3 blocks with empty middle block', async ({ editor, page }) => {
		// Arrange. Type four paragraphs with the second one empty.
		await editor.focus();
		await page.keyboard.type('line 1', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');
		await page.keyboard.type('line 3', { delay: 10 });
		await page.keyboard.press('Enter');
		await page.keyboard.type('line 4', { delay: 10 });

		// Build the cross-block selection: block 0 offset 0 through block 2 offset 6.
		await page.evaluate(() => {
			const root = document.querySelector('notectl-editor');
			const content = root?.shadowRoot?.querySelector('.notectl-content');
			if (!content) throw new Error('content not found');
			const blocks = content.querySelectorAll('[data-block-id]');
			const startBlock = blocks[0];
			const endBlock = blocks[2];
			if (!startBlock || !endBlock) throw new Error('blocks not found');

			const startText = document
				.createTreeWalker(startBlock, NodeFilter.SHOW_TEXT)
				.nextNode() as Text | null;
			const endText = document
				.createTreeWalker(endBlock, NodeFilter.SHOW_TEXT)
				.nextNode() as Text | null;
			if (!startText || !endText) throw new Error('text nodes not found');

			const range = document.createRange();
			range.setStart(startText, 0);
			range.setEnd(endText, endText.length);
			const sel = window.getSelection();
			sel?.removeAllRanges();
			sel?.addRange(range);
			document.dispatchEvent(new Event('selectionchange'));
		});

		const boldBtn = editor.markButton('bold');
		await expect(boldBtn).toHaveAttribute('aria-pressed', 'false');

		// Act. Apply Bold.
		await boldBtn.click();

		// Toolbar reflects the active state across the multi-block selection,
		// even though the middle block is empty. The auto-waiting assertion is
		// the sync point; no manual sleep needed.
		await expect(boldBtn).toHaveAttribute('aria-pressed', 'true');

		// Both non-empty blocks become bold.
		const htmlAfterApply = await editor.getContentHTML();
		expect(htmlAfterApply).toContain('<strong>line 1</strong>');
		expect(htmlAfterApply).toContain('<strong>line 3</strong>');

		// Toggling Bold again removes the mark from the selection.
		await boldBtn.click();
		await expect(boldBtn).toHaveAttribute('aria-pressed', 'false');
		const htmlAfterToggleOff = await editor.getContentHTML();
		expect(htmlAfterToggleOff).not.toContain('<strong>');
	});
});
