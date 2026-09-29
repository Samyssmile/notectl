import type { CDPSession, Page } from '@playwright/test';
import { type EditorPage, expect, test } from './fixtures/editor-page';

/**
 * #260: document changes made while an IME composition is open survive its
 * commit. Chromium performs the composition through CDP; the concurrent edits
 * come from the host API (`dispatch`, `setJSON`) and a paste.
 */

interface InlineSnapshot {
	readonly text?: string;
	readonly inlineType?: string;
}

const FORMULA = {
	type: 'inline',
	inlineType: 'math_inline',
	attrs: { mathml: '<math><mi>F</mi></math>', latex: 'F', alt: '', fontSize: '' },
	marks: [],
};

const text = (value: string) => ({ type: 'text', text: value, marks: [] });

async function seed(editor: EditorPage, children: readonly object[]): Promise<void> {
	await editor.setJSON({ children: [{ id: 'p', type: 'paragraph', children }] });
}

/** Collapses the DOM caret in the first text node of the paragraph and waits for the model. */
async function placeCaret(
	editor: EditorPage,
	domOffset: number,
	modelOffset: number,
): Promise<void> {
	await editor.content.evaluate((content: HTMLElement, offset: number) => {
		const first: Node | null | undefined = content.querySelector('[data-block-id="p"]')?.firstChild;
		if (!(first instanceof Text)) throw new Error('Paragraph does not start with text');
		content.focus();
		document.getSelection()?.collapse(first, offset);
	}, domOffset);
	await expectCaret(editor.page, modelOffset);
}

async function caretAtEnd(editor: EditorPage, modelOffset: number): Promise<void> {
	await editor.content.focus();
	await editor.page.keyboard.press('End');
	await expectCaret(editor.page, modelOffset);
}

async function expectCaret(page: Page, offset: number): Promise<void> {
	await expect
		.poll(() =>
			page.evaluate(() => {
				const el = document.querySelector('notectl-editor') as unknown as {
					getState(): { selection: { head: { offset: number } } };
				};
				return el.getState().selection.head.offset;
			}),
		)
		.toBe(offset);
}

async function startComposition(page: Page, composed: string): Promise<CDPSession> {
	const cdp: CDPSession = await page.context().newCDPSession(page);
	await cdp.send('Input.imeSetComposition', {
		text: composed,
		selectionStart: composed.length,
		selectionEnd: composed.length,
	});
	return cdp;
}

/** Inserts `value` at `offset` of the paragraph through the public `dispatch` API. */
async function hostInsert(page: Page, offset: number, value: string): Promise<void> {
	await page.evaluate(
		({ at, insert }) => {
			type Builder = { insertText(...args: unknown[]): Builder; build(): unknown };
			const el = document.querySelector('notectl-editor') as unknown as {
				getState(): { transaction(origin: string): Builder };
				dispatch(tr: unknown): void;
			};
			el.dispatch(el.getState().transaction('api').insertText('p', at, insert, []).build());
		},
		{ at: offset, insert: value },
	);
}

/** Paragraph content from the model: text verbatim, inline nodes as `[type]`. */
async function modelContent(editor: EditorPage): Promise<string> {
	const json = await editor.getJSON();
	return (json.children[0]?.children ?? [])
		.map((node: InlineSnapshot) => (node.inlineType ? `[${node.inlineType}]` : node.text))
		.join('');
}

async function expectContent(editor: EditorPage, expected: string): Promise<void> {
	await expect.poll(() => modelContent(editor)).toBe(expected);
	expect(await editor.getContentHTML()).not.toContain('￼');
	const rendered: string = await editor.content
		.locator('[data-block-id="p"]')
		.evaluate((p) => p.textContent ?? '');
	expect(rendered).not.toContain('￼');
}

test.describe('IME composition with concurrent document changes (#260)', () => {
	test('keeps a host dispatch in front of the composition and the formula a node', async ({
		editor,
		page,
	}) => {
		await seed(editor, [text('pre '), FORMULA, text(' post')]);
		await caretAtEnd(editor, 10);

		const cdp: CDPSession = await startComposition(page, 'x');
		await hostInsert(page, 0, 'Z');
		await cdp.send('Input.insertText', { text: 'x' });

		await expectContent(editor, 'Zpre [math_inline] postx');
		expect(await editor.getContentHTML()).toContain('<math');
		await expectCaret(page, 12);
	});

	test('keeps a host dispatch behind a composition in front of the formula', async ({
		editor,
		page,
	}) => {
		await seed(editor, [text('pre '), FORMULA, text(' post')]);
		await placeCaret(editor, 4, 4);

		const cdp: CDPSession = await startComposition(page, 'x');
		await hostInsert(page, 10, 'Z');
		await cdp.send('Input.insertText', { text: 'x' });

		await expectContent(editor, 'pre x[math_inline] postZ');
		await expectCaret(page, 5);
	});

	test('keeps a host dispatch into a plain paragraph', async ({ editor, page }) => {
		await seed(editor, [text('hello')]);
		await caretAtEnd(editor, 5);

		const cdp: CDPSession = await startComposition(page, 'x');
		await hostInsert(page, 0, 'Z');
		await cdp.send('Input.insertText', { text: 'x' });

		await expectContent(editor, 'Zhellox');
		await page.keyboard.type('!');
		await expectContent(editor, 'Zhellox!');
		expect(await editor.content.locator('[data-block-id="p"]').evaluate((p) => p.textContent)).toBe(
			'Zhellox!',
		);
	});

	test('keeps content a host sets with the same block id', async ({ editor, page }) => {
		await seed(editor, [text('hello')]);
		await caretAtEnd(editor, 5);

		const cdp: CDPSession = await startComposition(page, 'x');
		await seed(editor, [text('bye')]);
		await cdp.send('Input.insertText', { text: 'x' });

		await expectContent(editor, 'byex');
		expect(await editor.content.locator('[data-block-id="p"]').evaluate((p) => p.textContent)).toBe(
			'byex',
		);
	});

	test('keeps text pasted while composing', async ({ editor, page }) => {
		await seed(editor, [text('hello')]);
		await caretAtEnd(editor, 5);

		const cdp: CDPSession = await startComposition(page, 'x');
		await editor.pasteText('P');
		await cdp.send('Input.insertText', { text: 'x' });

		await expectContent(editor, 'helloxP');
	});
});
