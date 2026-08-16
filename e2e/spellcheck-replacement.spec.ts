import { expect, test } from './fixtures/editor-page';

/**
 * Native spellcheck/autocorrect acceptance (#218).
 *
 * Playwright cannot click entries of the browser's native context menu, so
 * these tests dispatch the exact `beforeinput` event the browser fires when a
 * suggestion is accepted: `inputType: 'insertReplacementText'` with the
 * replacement on `dataTransfer` (`data` stays null in Chromium/WebKit) and the
 * misspelled word reported via `targetRanges`.
 */
test.describe('Native spellcheck replacement (#218)', () => {
	/** Dispatches an insertReplacementText beforeinput on the editor content. */
	function dispatchReplacement(
		content: HTMLElement,
		options: { readonly word: string; readonly replacement: string; readonly selectWord: boolean },
	): { readonly dispatched: boolean; readonly hadTargetRanges: boolean } {
		const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
		let textNode: Node | null = walker.nextNode();
		while (textNode && !(textNode.textContent ?? '').includes(options.word)) {
			textNode = walker.nextNode();
		}
		if (!textNode) return { dispatched: false, hadTargetRanges: false };

		const start = (textNode.textContent ?? '').indexOf(options.word);
		const end = start + options.word.length;
		const range = new StaticRange({
			startContainer: textNode,
			startOffset: start,
			endContainer: textNode,
			endOffset: end,
		});

		if (options.selectWord) {
			// Chrome selects the misspelled word when its context menu opens.
			window.getSelection()?.setBaseAndExtent(textNode, start, textNode, end);
		}

		const dataTransfer = new DataTransfer();
		dataTransfer.setData('text/plain', options.replacement);
		const event = new InputEvent('beforeinput', {
			inputType: 'insertReplacementText',
			dataTransfer,
			targetRanges: [range],
			bubbles: true,
			cancelable: true,
			composed: true,
		});
		const hadTargetRanges = event.getTargetRanges().length > 0;
		content.dispatchEvent(event);
		return { dispatched: true, hadTargetRanges };
	}

	test('accepting a suggestion replaces the selected misspelled word', async ({ editor, page }) => {
		await editor.typeText('helo world');

		const result = await editor.content.evaluate(dispatchReplacement, {
			word: 'helo',
			replacement: 'hello',
			selectWord: true,
		});
		expect(result.dispatched).toBe(true);

		const text = await editor.getText();
		expect(text.trim()).toBe('hello world');

		// The correction is a normal transaction: undo restores the typo.
		await page.keyboard.press('Control+z');
		const undone = await editor.getText();
		expect(undone.trim()).toBe('helo world');
	});

	test('autocorrect targets the reported word range while the caret stays collapsed', async ({
		editor,
	}) => {
		await editor.typeText('helo world');

		// Caret sits at the end of the line; only targetRanges names the word.
		const result = await editor.content.evaluate(dispatchReplacement, {
			word: 'helo',
			replacement: 'hello',
			selectWord: false,
		});
		expect(result.dispatched).toBe(true);
		test.skip(!result.hadTargetRanges, 'browser drops targetRanges on synthetic events');

		const text = await editor.getText();
		expect(text.trim()).toBe('hello world');
	});
});
