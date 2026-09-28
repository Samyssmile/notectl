import type { CDPSession, Page } from '@playwright/test';
import { type EditorPage, expect, test } from './fixtures/editor-page';

/**
 * #256: Chromium performs the composition DOM edits through CDP. The break
 * beforeinput is synthetic: CDP cannot emulate an Android keyboard's event
 * ordering. These tests cover that ordering without claiming device coverage.
 */
type BreakInput = 'insertParagraph' | 'insertLineBreak';

interface InlineSnapshot {
	readonly text?: string;
	readonly inlineType?: string;
}

async function compose(cdp: CDPSession, text: string): Promise<void> {
	await cdp.send('Input.imeSetComposition', {
		text,
		selectionStart: text.length,
		selectionEnd: text.length,
	});
}

async function requestBreak(
	editor: EditorPage,
	inputType: BreakInput,
	isComposing = true,
): Promise<boolean> {
	return editor.content.evaluate(
		(content, input) => {
			const event = new InputEvent('beforeinput', {
				...input,
				bubbles: true,
				cancelable: true,
				composed: true,
			});
			content.dispatchEvent(event);
			return event.defaultPrevented;
		},
		{ inputType, isComposing },
	);
}

async function seed(editor: EditorPage, page: Page, text: string): Promise<void> {
	await editor.setJSON({
		children: [
			{ id: 'paragraph', type: 'paragraph', children: [{ type: 'text', text, marks: [] }] },
		],
	});
	await editor.content.focus();
	await page.keyboard.press('End');
	await expectSelection(page, text.length, text.length);
}

async function expectSelection(page: Page, anchor: number, head: number): Promise<void> {
	await expect
		.poll(() =>
			page.evaluate(() => {
				const el = document.querySelector('notectl-editor') as unknown as {
					getState(): { selection: { anchor: { offset: number }; head: { offset: number } } };
				};
				const { anchor, head } = el.getState().selection;
				return [anchor.offset, head.offset];
			}),
		)
		.toEqual([anchor, head]);
}

/** Compare paragraph boundaries and hard breaks in both the model and live DOM. */
async function expectParagraphs(editor: EditorPage, paragraphs: readonly string[]): Promise<void> {
	const json = await editor.getJSON();
	expect(json.children.map((block) => block.type)).toEqual(paragraphs.map(() => 'paragraph'));
	expect(
		json.children.map((block) =>
			block.children
				.map((node: InlineSnapshot) => (node.inlineType === 'hard_break' ? '\n' : node.text))
				.join(''),
		),
	).toEqual(paragraphs);
	expect(
		await editor.content.locator('p').evaluateAll((blocks) =>
			blocks.map((block) => {
				const clone = block.cloneNode(true) as HTMLElement;
				// The renderer also adds unmarked <br>s for empty-line carets.
				for (const br of clone.querySelectorAll('br[contenteditable="false"]')) {
					br.replaceWith('\n');
				}
				return (clone.textContent ?? '').replaceAll('\u00a0', ' ');
			}),
		),
	).toEqual(paragraphs);
}

function brokenParagraphs(inputType: BreakInput, before: string, after: string): string[] {
	return inputType === 'insertParagraph' ? [before, after] : [`${before}\n${after}`];
}

for (const inputType of ['insertParagraph', 'insertLineBreak'] as const) {
	test.describe(`IME ${inputType}`, () => {
		for (const isComposing of [true, false]) {
			test(`defers the break until commit (event.isComposing=${isComposing})`, async ({
				editor,
				page,
			}) => {
				await seed(editor, page, 'hello ');
				const initial = await editor.getJSON();
				const cdp = await page.context().newCDPSession(page);

				await compose(cdp, '世界');
				expect(await requestBreak(editor, inputType, isComposing)).toBe(true);
				expect(await editor.getJSON()).toEqual(initial);
				await expect(editor.content.locator('p')).toHaveCount(1);
				await expect(editor.content.locator('p')).toHaveText('hello 世界');
				await expect(editor.content.locator('br[contenteditable="false"]')).toHaveCount(0);

				await cdp.send('Input.insertText', { text: '世界' });
				await expectParagraphs(editor, brokenParagraphs(inputType, 'hello 世界', ''));

				// Breaks are distinct history steps from the committed composition.
				await page.keyboard.press('Control+z');
				await expectParagraphs(editor, ['hello 世界']);
				await page.keyboard.press('Control+z');
				await expectParagraphs(editor, ['hello ']);
				await page.keyboard.press('Control+Shift+z');
				await expectParagraphs(editor, ['hello 世界']);
				await page.keyboard.press('Control+Shift+z');
				await expectParagraphs(editor, brokenParagraphs(inputType, 'hello 世界', ''));

				await page.keyboard.type('next');
				await expectParagraphs(editor, brokenParagraphs(inputType, 'hello 世界', 'next'));
			});
		}

		test('preserves marks and the suffix when composing in the middle of text', async ({
			editor,
			page,
		}) => {
			await seed(editor, page, 'left right');
			for (let i = 0; i < 'right'.length; i++) await page.keyboard.press('ArrowLeft');
			await expectSelection(page, 5, 5);
			await page.keyboard.press('Control+b');
			const cdp = await page.context().newCDPSession(page);

			await compose(cdp, '世界');
			await expect(editor.content.locator('p')).toHaveText('left 世界right');
			expect(await requestBreak(editor, inputType)).toBe(true);
			await cdp.send('Input.insertText', { text: '世界' });
			await expectParagraphs(editor, brokenParagraphs(inputType, 'left 世界', 'right'));
			await expect(editor.content.locator('strong')).toHaveText('世界');
			const json = await editor.getJSON();
			expect(json.children[0]?.children.find((node) => node.text === '世界')?.marks).toEqual([
				{ type: 'bold' },
			]);

			await page.keyboard.type('!');
			await expectParagraphs(editor, brokenParagraphs(inputType, 'left 世界', '!right'));
		});

		for (const committed of ['cart', 'cat']) {
			test(`places the break after a selected word recomposed as "${committed}"`, async ({
				editor,
				page,
			}) => {
				await seed(editor, page, 'cat');
				await page.keyboard.press('Shift+Home');
				await expectSelection(page, 3, 0);
				const cdp = await page.context().newCDPSession(page);
				await compose(cdp, committed);
				await expect(editor.content.locator('p')).toHaveText(committed);
				expect(await requestBreak(editor, inputType)).toBe(true);
				await cdp.send('Input.insertText', { text: committed });

				await expectParagraphs(editor, brokenParagraphs(inputType, committed, ''));
				await page.keyboard.type('next');
				await expectParagraphs(editor, brokenParagraphs(inputType, committed, 'next'));
			});
		}

		test('keeps normal commit-then-keyboard-break ordering', async ({ editor, page }) => {
			await seed(editor, page, 'hello ');
			const cdp = await page.context().newCDPSession(page);
			await compose(cdp, '世界');
			await cdp.send('Input.insertText', { text: '世界' });
			await page.keyboard.press(inputType === 'insertParagraph' ? 'Enter' : 'Shift+Enter');
			await page.keyboard.type('next');

			await expectParagraphs(editor, brokenParagraphs(inputType, 'hello 世界', 'next'));
		});
	});
}
