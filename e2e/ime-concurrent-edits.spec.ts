import type { Page } from '@playwright/test';
import { type EditorPage, expect, test } from './fixtures/editor-page';
import { type ImeDriver, imeDriver } from './fixtures/ime-driver';

/**
 * IME commits next to other edits (#260), next to identical inline nodes
 * (#261), inside containers (#264), and after the browser dropped a
 * composition (#265).
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

interface BlockJSON {
	readonly id: string;
	readonly type: string;
	readonly attrs?: Readonly<Record<string, string | number | boolean>>;
	readonly children: readonly (BlockJSON | ChildJSON)[];
}

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

function paragraph(id: string, value: string): BlockJSON {
	return { id, type: 'paragraph', children: [text(value)] };
}

/** Replaces the document with `blocks` and puts the caret into block `block` at `offset`. */
async function seedDoc(
	editor: EditorPage,
	blocks: readonly BlockJSON[],
	block: string,
	offset: number,
): Promise<void> {
	await editor.setJSON({ children: blocks });
	await editor.content.focus();
	await editor.page.evaluate(
		({ id, at }) => {
			const el = document.querySelector('notectl-editor') as ModelEditor;
			const position = { blockId: id, offset: at };
			el.dispatch(
				el.getState().transaction('api').setSelection({ anchor: position, head: position }).build(),
			);
		},
		{ id: block, at: offset },
	);
}

/** Replaces the document with one paragraph and puts the caret at `caret`. */
async function seed(
	editor: EditorPage,
	children: readonly ChildJSON[],
	caret: number,
): Promise<void> {
	await seedDoc(editor, [{ id: BLOCK, type: 'paragraph', children }], BLOCK, caret);
}

/** A transaction from outside the composition, as a host or collaborator would dispatch it. */
async function hostInsert(page: Page, offset: number, value: string, block = BLOCK): Promise<void> {
	await page.evaluate(
		({ id, at, insert }) => {
			const el = document.querySelector('notectl-editor') as ModelEditor;
			el.dispatch(el.getState().transaction('api').insertText(id, at, insert, []).build());
		},
		{ id: block, at: offset, insert: value },
	);
}

/** Model text of block `id`, found at any depth. */
async function modelText(editor: EditorPage, id: string): Promise<string> {
	const find = (nodes: readonly (BlockJSON | ChildJSON)[]): BlockJSON | undefined => {
		for (const node of nodes) {
			if (!('id' in node)) continue;
			if (node.id === id) return node;
			const nested: BlockJSON | undefined = find(node.children);
			if (nested) return nested;
		}
		return undefined;
	};
	const json = (await editor.getJSON()) as { children: readonly BlockJSON[] };
	return (find(json.children)?.children ?? [])
		.map((child) => ('text' in child ? child.text : ''))
		.join('');
}

/** Rendered text of block `id`, with the NBSPs the renderer draws read as spaces. */
async function renderedTextOf(editor: EditorPage, id: string): Promise<string> {
	const rendered: string = await editor.content
		.locator(`[data-block-id="${id}"]`)
		.evaluate((element) => element.textContent ?? '');
	return rendered.replaceAll('\u00a0', ' ');
}

async function expectBlockText(editor: EditorPage, id: string, expected: string): Promise<void> {
	expect(await modelText(editor, id)).toBe(expected);
	expect(await renderedTextOf(editor, id)).toBe(expected);
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
		await expectInlines(editor, ['Zpre ', 'math:F', ' postx']);
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

test.describe('IME compositions inside containers (#264)', () => {
	function cell(id: string, value: string): BlockJSON {
		return { id: `${id}-cell`, type: 'table_cell', children: [paragraph(id, value)] };
	}

	const TABLE: readonly BlockJSON[] = [
		{
			id: 'table',
			type: 'table',
			children: [
				{ id: 'row1', type: 'table_row', children: [cell('a', 'c1'), cell('b', 'c2')] },
				{ id: 'row2', type: 'table_row', children: [cell('c', 'c3'), cell('d', 'c4')] },
			],
		},
	];
	const QUOTE: readonly BlockJSON[] = [
		{
			id: 'quote',
			type: 'blockquote',
			children: [paragraph('q1', 'first quoted'), paragraph('q2', 'second quoted')],
		},
	];
	const LIST: readonly BlockJSON[] = [
		{
			id: 'item',
			type: 'list_item',
			attrs: { listType: 'bullet', indent: 0, checked: false },
			children: [paragraph('l1', 'first para'), paragraph('l2', 'second para')],
		},
	];

	const CASES = [
		{ name: 'a table cell', doc: TABLE, composing: 'a', value: 'c1', sibling: 'd', other: 'c4' },
		{
			name: 'a blockquote paragraph',
			doc: QUOTE,
			composing: 'q2',
			value: 'second quoted',
			sibling: 'q1',
			other: 'first quoted',
		},
		{
			name: 'a list item paragraph',
			doc: LIST,
			composing: 'l2',
			value: 'second para',
			sibling: 'l1',
			other: 'first para',
		},
	];

	for (const { name, doc, composing, value, sibling, other } of CASES) {
		test(`a composition in ${name} survives an edit elsewhere in its container`, async ({
			editor,
			page,
		}) => {
			await seedDoc(editor, doc, composing, value.length);
			const ime: ImeDriver = await imeDriver(page);

			await ime.compose('k');
			await ime.compose('ka');
			await hostInsert(page, 0, 'Z', sibling);
			await ime.compose('kan');
			await ime.commit('かん');

			await expectBlockText(editor, composing, `${value}かん`);
			await expectBlockText(editor, sibling, `Z${other}`);
		});
	}

	test('a cancelled composition in a table cell shows the edit the container received', async ({
		editor,
		page,
	}) => {
		await seedDoc(editor, TABLE, 'a', 2);
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('k');
		await hostInsert(page, 0, 'Z', 'd');
		await ime.compose('');

		await expectBlockText(editor, 'a', 'c1');
		await expectBlockText(editor, 'd', 'Zc4');
	});
});

test.describe('IME compositions the browser dropped (#265)', () => {
	test('Backspace and Enter work after setJSON replaced the composing block', async ({
		editor,
		page,
	}) => {
		await seedDoc(editor, [paragraph(BLOCK, 'hello world')], BLOCK, 11);
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('x');
		await editor.setJSON({ children: [paragraph('fresh', 'hello world')] });
		await page.keyboard.press('End');
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Enter');
		await page.keyboard.type('y');

		const json = (await editor.getJSON()) as { children: readonly BlockJSON[] };
		expect(json.children).toHaveLength(2);
		await expectBlockText(editor, 'fresh', 'hello worl');
	});

	test('a composition in bold text survives setJSON(getJSON())', async ({ editor, page }) => {
		await seedDoc(editor, [paragraph(BLOCK, 'hello')], BLOCK, 5);
		await page.keyboard.press('Control+b');
		const ime: ImeDriver = await imeDriver(page);

		await ime.compose('x');
		await editor.setJSON(await editor.getJSON());
		await ime.commit('x');
		await page.keyboard.type('!');

		await expectBlockText(editor, BLOCK, 'hellox!');
	});
});
