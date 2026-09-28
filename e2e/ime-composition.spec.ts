import type { Page } from '@playwright/test';
import { type EditorPage, expect, test } from './fixtures/editor-page';
import { type ImeDriver, imeDriver } from './fixtures/ime-driver';

/**
 * IME composition commits (#230, #257).
 *
 * A composition is committed from the rendered DOM of the composition block:
 * whatever the browser did to that block while composing becomes the model
 * change. Most tests drive Chromium's IME emulation over CDP, so the browser
 * performs the real DOM edits. Android Gboard sequences (composing deletions)
 * cannot be driven that way; those tests dispatch synthetic events and apply
 * the browser's DOM edit themselves, because synthetic events have no default
 * action.
 */

/**
 * Text of the first rendered paragraph, as the user sees it. The renderer
 * draws edge and double spaces as NBSP, so those compare as spaces.
 */
async function renderedText(editor: EditorPage): Promise<string> {
	const text: string = await editor.content
		.locator('p')
		.first()
		.evaluate((p) => p.textContent ?? '');
	return text.replaceAll(' ', ' ');
}

/**
 * Waits out the history grouping window (500 ms) so the next edit gets its
 * own undo step instead of merging with the preceding typing.
 */
async function closeUndoGroup(page: Page): Promise<void> {
	await page.waitForTimeout(600);
}

async function expectText(editor: EditorPage, expected: string): Promise<void> {
	expect(await editor.getText()).toBe(expected);
	expect(await renderedText(editor)).toBe(expected);
}

test.describe('IME composition commit', () => {
	test('commits a composition typed at the caret', async ({ editor, page }) => {
		await editor.typeText('hello');
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('wo');
		await ime.commit('wo');
		await page.keyboard.type('!');

		await expectText(editor, 'hellowo!');
	});

	test('composed text inherits marks toggled at a collapsed caret', async ({ editor, page }) => {
		await editor.typeText('hello ');
		await page.keyboard.press('Control+b');
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('wo');
		await ime.commit('wo');

		const json = await editor.getJSON();
		const children = json.children[0]?.children ?? [];
		expect(children.map((c) => c.text)).toEqual(['hello ', 'wo']);
		expect(children[1]?.marks.map((m) => m.type)).toEqual(['bold']);
		expect(await renderedText(editor)).toBe('hello wo');
	});

	test('back-to-back compositions commit in order', async ({ editor, page }) => {
		await editor.typeText('a');
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('가');
		await ime.commit('가');
		await ime.compose('나');
		await ime.commit('나');

		await expectText(editor, 'a가나');
	});

	test('recomposing a committed word does not duplicate it', async ({ editor, page }) => {
		await editor.typeText('hello');
		await closeUndoGroup(page);
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('hello', { start: 0, end: 5 });
		await ime.compose('help');
		await ime.commit('help');
		await expectText(editor, 'help');

		await page.keyboard.press('Control+z');
		await expectText(editor, 'hello');
	});

	test('recomposition that removes committed text keeps DOM and model in sync (#257)', async ({
		editor,
		page,
	}) => {
		await editor.typeText('hello world');
		await closeUndoGroup(page);
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('world', { start: 6, end: 11 });
		await ime.compose('');
		await expectText(editor, 'hello ');

		await page.keyboard.press('Backspace');
		await expectText(editor, 'hello');

		await page.keyboard.press('Control+z');
		await expectText(editor, 'hello world');
	});
});

test.describe('IME composing deletions (#230, #257)', () => {
	const COMPOSING: InputEventInit = {
		isComposing: true,
		bubbles: true,
		cancelable: false,
		composed: true,
	};

	test('backspace inside the composition keeps committed text (#230)', async ({ editor }) => {
		await editor.typeText('hello');

		// Gboard composes `wo` and backspaces the `o`: net DOM edit is `w`.
		await editor.content.evaluate((content: HTMLElement, composing: InputEventInit) => {
			const paragraph: HTMLElement | null = content.querySelector('p');
			content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
			content.dispatchEvent(
				new InputEvent('beforeinput', {
					...composing,
					inputType: 'insertCompositionText',
					data: 'wo',
				}),
			);
			content.dispatchEvent(
				new InputEvent('beforeinput', { ...composing, inputType: 'deleteContentBackward' }),
			);
			paragraph?.append('w');
			content.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'w' }));
		}, COMPOSING);

		await expectText(editor, 'hellow');
	});

	test('a composing deletion that reaches committed text is applied (#257)', async ({
		editor,
		page,
	}) => {
		await editor.typeText('hello');

		// The composition is empty; the composing backspace removes the committed `o`.
		await editor.content.evaluate((content: HTMLElement, composing: InputEventInit) => {
			const text: Node | null | undefined = content.querySelector('p')?.firstChild;
			content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
			content.dispatchEvent(
				new InputEvent('beforeinput', { ...composing, inputType: 'deleteContentBackward' }),
			);
			if (text instanceof Text) text.deleteData(4, 1);
			content.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
		}, COMPOSING);
		await expectText(editor, 'hell');

		await page.keyboard.press('Backspace');
		await expectText(editor, 'hel');
	});
});

/**
 * The commit diffs the rendered text of the composition block against the
 * model, so every real leaf renderer must read back as exactly its model text.
 * Otherwise a composition would rewrite committed text around it.
 */
test.describe('IME composition in every leaf type', () => {
	interface JSONNode {
		id?: string;
		type: string;
		text?: string;
		children?: JSONNode[];
		[key: string]: unknown;
	}

	const text = (value: string, marks: readonly string[] = []): JSONNode => ({
		type: 'text',
		text: value,
		marks: marks.map((type) => ({ type })),
	});
	const paragraph = (id: string, children: JSONNode[]): JSONNode => ({
		id,
		type: 'paragraph',
		children,
	});
	const listItem = (id: string, listType: string, children: JSONNode[]): JSONNode => ({
		id,
		type: 'list_item',
		attrs: { listType, indent: 0, checked: false },
		children,
	});

	const DOC: { children: JSONNode[] } = {
		children: [
			{
				id: 'code',
				type: 'code_block',
				attrs: { language: 'js' },
				children: [text('let a = 1;\nlet b = 2;\n')],
			},
			listItem('bullet', 'bullet', [text('bullet')]),
			listItem('todo', 'checklist', [text('todo')]),
			listItem('multi', 'ordered', [
				paragraph('multi-1', [text('first')]),
				paragraph('multi-2', [text('second')]),
			]),
			{
				id: 'table',
				type: 'table',
				children: [
					{
						id: 'row',
						type: 'table_row',
						children: [
							{ id: 'cell', type: 'table_cell', children: [paragraph('cell-p', [text('cell')])] },
						],
					},
				],
			},
			{ id: 'quote', type: 'blockquote', children: [paragraph('quote-p', [text('quoted')])] },
			paragraph('marks', [text('plain '), text('bold', ['bold']), text(' end')]),
			paragraph('breaks', [
				text('a'),
				{ type: 'inline', inlineType: 'hard_break', attrs: {}, marks: [] },
				text('b'),
			]),
			paragraph('formula', [
				text('sum '),
				{
					type: 'inline',
					inlineType: 'math_inline',
					attrs: { mathml: '<math><mi>x</mi></math>', latex: 'x', alt: '', fontSize: '' },
					marks: [],
				},
				text(' end'),
			]),
			{
				id: 'heading',
				type: 'heading',
				attrs: { level: 2 },
				children: [text(' spaced  heading ')],
			},
		],
	};

	function findBlock(nodes: readonly JSONNode[], id: string): JSONNode | undefined {
		for (const node of nodes) {
			if (node.id === id) return node;
			const nested: JSONNode | undefined = findBlock(node.children ?? [], id);
			if (nested) return nested;
		}
		return undefined;
	}

	/** Places a collapsed DOM caret after the last character of block `id`. */
	async function caretAtEnd(editor: EditorPage, id: string): Promise<void> {
		await editor.content.evaluate((content: HTMLElement, blockId: string) => {
			const block: Element | null = content.querySelector(`[data-block-id="${blockId}"]`);
			const root: Element | null = block?.querySelector('[data-content-dom]') ?? block;
			if (!root) throw new Error(`No rendered block ${blockId}`);
			const walker: TreeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			let last: Node | null = null;
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				if (!node.parentElement?.closest('[contenteditable="false"]')) last = node;
			}
			if (!last) throw new Error(`No text in block ${blockId}`);
			content.focus();
			document.getSelection()?.collapse(last, last.textContent?.length ?? 0);
		}, id);
		await expect
			.poll(() =>
				editor.page.evaluate(() => {
					const el = document.querySelector('notectl-editor') as unknown as {
						getState(): { selection: { anchor?: { blockId: string } } };
					};
					return el.getState().selection.anchor?.blockId;
				}),
			)
			.toBe(id);
	}

	const LEAVES: readonly string[] = [
		'code',
		'bullet',
		'todo',
		'multi-2',
		'cell-p',
		'quote-p',
		'marks',
		'breaks',
		'formula',
		'heading',
	];

	for (const id of LEAVES) {
		test(`composing at the end of "${id}" matches typing there`, async ({ editor, page }) => {
			// Oracle: the same character typed on the keyboard, including whatever
			// plugins (e.g. automatic text direction) append to a text edit.
			await editor.setJSON(DOC);
			await caretAtEnd(editor, id);
			await page.keyboard.type('x');
			const typed = await editor.getJSON();
			const typedLeaf: JSONNode | undefined = findBlock(
				typed.children as unknown as JSONNode[],
				id,
			);
			expect(typedLeaf?.children?.at(-1)?.text).toMatch(/x$/);

			await editor.setJSON(DOC);
			await caretAtEnd(editor, id);
			const ime: ImeDriver = await imeDriver(page);
			await ime.compose('x');
			await ime.commit('x');

			expect(await editor.getJSON()).toEqual(typed);
		});
	}
});
