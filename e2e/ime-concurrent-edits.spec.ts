import type { Page } from '@playwright/test';
import { type EditorPage, expect, test } from './fixtures/editor-page';
import { type ImeDriver, imeDriver } from './fixtures/ime-driver';

/**
 * IME commits next to other edits (#260) and next to identical inline nodes
 * (#261).
 *
 * The composition block's DOM shows the block as it was when the composition
 * started, plus the browser's edits. A commit must keep edits the model
 * received meanwhile and must delete exactly the inline node the browser
 * removed.
 */

const BLOCK = 'p';
const PLACEHOLDER = '￼';

interface InlineJSON {
	readonly type: 'inline';
	readonly inlineType: string;
	readonly attrs: Readonly<Record<string, string>>;
	readonly marks: readonly unknown[];
}

interface TextJSON {
	readonly type: 'text';
	readonly text: string;
	readonly marks: readonly unknown[];
}

type ChildJSON = InlineJSON | TextJSON;

/** Minimal editor surface for model-level setup from the page. */
interface ModelEditor extends HTMLElement {
	getState(): { transaction(origin: string): TransactionBuilder };
	dispatch(tr: unknown): void;
}

interface TransactionBuilder {
	insertText(block: string, offset: number, text: string, marks: readonly unknown[]): this;
	setSelection(selection: unknown): this;
	build(): unknown;
}

function formula(latex: string): InlineJSON {
	return {
		type: 'inline',
		inlineType: 'math_inline',
		attrs: { mathml: `<math><mi>${latex}</mi></math>`, latex, alt: '', fontSize: '' },
		marks: [],
	};
}

function hardBreak(): InlineJSON {
	return { type: 'inline', inlineType: 'hard_break', attrs: {}, marks: [] };
}

function text(value: string): TextJSON {
	return { type: 'text', text: value, marks: [] };
}

/** Replaces the document with one paragraph and puts the caret at `caret`. */
async function seed(
	editor: EditorPage,
	children: readonly ChildJSON[],
	caret: number,
): Promise<void> {
	await editor.setJSON({ children: [{ id: BLOCK, type: 'paragraph', children }] });
	await editor.content.focus();
	await editor.page.evaluate(
		({ block, offset }) => {
			const el = document.querySelector('notectl-editor') as ModelEditor;
			const position = { blockId: block, offset };
			el.dispatch(
				el.getState().transaction('api').setSelection({ anchor: position, head: position }).build(),
			);
		},
		{ block: BLOCK, offset: caret },
	);
}

/** A transaction from outside the composition, as a host or collaborator would dispatch it. */
async function hostInsert(page: Page, offset: number, value: string): Promise<void> {
	await page.evaluate(
		({ block, at, insert }) => {
			const el = document.querySelector('notectl-editor') as ModelEditor;
			el.dispatch(el.getState().transaction('api').insertText(block, at, insert, []).build());
		},
		{ block: BLOCK, at: offset, insert: value },
	);
}

/** Model inline content as text runs and `math:latex` / `break` entries. */
async function modelInlines(editor: EditorPage): Promise<string[]> {
	const json = await editor.getJSON();
	const children: readonly ChildJSON[] =
		(json.children[0] as { children?: readonly ChildJSON[] } | undefined)?.children ?? [];
	return children.map((child) => {
		if (child.type === 'text') return child.text;
		return child.inlineType === 'math_inline' ? `math:${child.attrs.latex}` : 'break';
	});
}

/** Rendered inline content in the same notation as {@link modelInlines}. */
async function renderedInlines(editor: EditorPage): Promise<string[]> {
	return editor.content.locator('p').evaluate((p) => {
		const out: string[] = [];
		for (const node of Array.from(p.childNodes)) {
			if (node.nodeType === Node.TEXT_NODE) {
				out.push((node.textContent ?? '').replaceAll(' ', ' '));
			} else if (node instanceof HTMLElement && node.getAttribute('contenteditable') === 'false') {
				out.push(node.tagName === 'BR' ? 'break' : `math:${node.textContent?.trim() ?? ''}`);
			}
		}
		return out;
	});
}

async function expectInlines(editor: EditorPage, expected: readonly string[]): Promise<void> {
	expect(await modelInlines(editor)).toEqual(expected);
	expect(await renderedInlines(editor)).toEqual(expected);
}

test.describe('IME commits keep edits made while composing (#260)', () => {
	test('a host edit in front of the composition survives the commit', async ({ editor, page }) => {
		await seed(editor, [text('pre '), formula('F'), text(' post')], 10);
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('x');
		await hostInsert(page, 0, 'Z');
		await ime.commit('x');

		await expectInlines(editor, ['Zpre ', 'math:F', ' postx']);
		expect(await editor.getContentHTML()).not.toContain(PLACEHOLDER);
	});

	test('a host edit behind the composition survives and keeps the inline node between', async ({
		editor,
		page,
	}) => {
		await seed(editor, [text('pre '), formula('F'), text(' post')], 4);
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('x');
		await hostInsert(page, 10, 'Z');
		await ime.commit('x');

		await expectInlines(editor, ['pre x', 'math:F', ' postZ']);
	});

	test('typing after the commit continues at the composed text', async ({ editor, page }) => {
		await seed(editor, [text('pre post')], 8);
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('x');
		await hostInsert(page, 0, 'Z');
		await ime.commit('x');
		await page.keyboard.type('!');

		await expectInlines(editor, ['Zpre postx!']);
	});

	test('setJSON with the same block id during a composition keeps the new content', async ({
		editor,
		page,
	}) => {
		await seed(editor, [text('old text')], 8);
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('x');
		await editor.setJSON({
			children: [{ id: BLOCK, type: 'paragraph', children: [text('NEW CONTENT')] }],
		});
		await ime.commit('x');

		const [content] = await modelInlines(editor);
		expect(content?.replace('x', '')).toBe('NEW CONTENT');
		await expectInlines(editor, [content ?? '']);
	});

	test('undo after the commit removes the composed text and keeps the host edit', async ({
		editor,
		page,
	}) => {
		await seed(editor, [text('pre '), formula('F'), text(' post')], 10);
		await page.waitForTimeout(600);
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('x');
		await hostInsert(page, 0, 'Z');
		await ime.commit('x');
		await page.keyboard.press('Control+z');

		await expectInlines(editor, ['Zpre ', 'math:F', ' post']);
	});
});

test.describe('IME deletions next to identical inline nodes (#261)', () => {
	test('an IME replacement that deletes a hard break keeps the formula after it', async ({
		editor,
		page,
	}) => {
		// "a" [break] | [formula F] "y": the IME recomposes the break and clears it.
		await seed(editor, [text('a'), hardBreak(), formula('F'), text('y')], 2);
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('q', { start: 1, end: 2 });
		await ime.compose('');

		await expectInlines(editor, ['a', 'math:F', 'y']);
	});

	test('a composing backspace between two formulas removes the one before the caret', async ({
		editor,
	}) => {
		// Android Gboard sequence; synthetic events have no default action, so the
		// browser's DOM edit is applied by hand.
		await seed(editor, [text('x'), formula('A'), formula('B'), text('z')], 2);

		await editor.content.evaluate((content: HTMLElement) => {
			const composing: InputEventInit = {
				isComposing: true,
				bubbles: true,
				cancelable: false,
				composed: true,
			};
			content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
			content.dispatchEvent(
				new InputEvent('beforeinput', { ...composing, inputType: 'deleteContentBackward' }),
			);
			content.querySelector('p > [contenteditable="false"]')?.remove();
			content.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
		});

		await expectInlines(editor, ['x', 'math:B', 'z']);
	});
});
