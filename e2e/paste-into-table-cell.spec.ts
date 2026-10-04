import { type EditorPage, expect, test } from './fixtures/editor-page';
import type { JsonChild } from './fixtures/table-utils';

/**
 * Pasting a block copied inside the editor into a table cell (#173). A block
 * the cell does not allow, such as a title (copied as text, the rich-block
 * route) or a display formula (copied as a node, the internal block route),
 * must not nest in the cell: it lands at the document root after the table,
 * and the cell keeps its own content. A block the cell allows still nests.
 */

const TABLE = {
	id: 'table',
	type: 'table',
	children: [
		{
			id: 'row',
			type: 'table_row',
			children: ['Left', 'Right'].map((text: string) => ({
				id: `cell-${text}`,
				type: 'table_cell',
				children: [
					{ id: `text-${text}`, type: 'paragraph', children: [{ type: 'text', text, marks: [] }] },
				],
			})),
		},
	],
};

/** Loads `block` followed by a two-cell table. */
async function loadBlockAndTable(
	editor: EditorPage,
	block: Record<string, unknown>,
): Promise<void> {
	await editor.setJSON({ children: [block, TABLE] });
}

/** Selects the whole text of the text block `selector` with the keyboard. */
async function selectTextOf(editor: EditorPage, selector: string): Promise<void> {
	await editor.content.locator(selector).click();
	await editor.page.keyboard.press('Home');
	await editor.page.keyboard.press('Shift+End');
}

/** Clicks into the left cell's text and waits until the editor's caret is there. */
async function placeCaretInLeftCell(editor: EditorPage): Promise<void> {
	await editor.content.locator('td p', { hasText: 'Left' }).click();
	await expect
		.poll(() =>
			editor.page.evaluate(() => {
				type Selection = { readonly anchor?: { readonly blockId: string } };
				const el = document.querySelector('notectl-editor') as unknown as {
					getState(): { readonly selection: Selection };
				};
				return el.getState().selection.anchor?.blockId;
			}),
		)
		.toBe('text-Left');
}

/** Pastes `copied` into the left cell and returns the document JSON. */
async function pasteIntoLeftCell(
	editor: EditorPage,
	copied: Record<string, string>,
): Promise<{ children: JsonChild[] }> {
	await placeCaretInLeftCell(editor);
	await editor.pasteClipboardData(copied);
	return editor.getJSON();
}

/** The block types at the document root, without a trailing empty paragraph. */
function rootTypes(doc: { children: JsonChild[] }): string[] {
	const types: string[] = doc.children.map((block: JsonChild) => block.type);
	const last: JsonChild | undefined = doc.children.at(-1);
	const trailingEmpty: boolean =
		last?.type === 'paragraph' && (last.children ?? []).every((c: JsonChild) => !c.text);
	return trailingEmpty ? types.slice(0, -1) : types;
}

/** The block types of every table cell, in document order. */
function cellContents(doc: { children: JsonChild[] }): string[][] {
	const table: JsonChild | undefined = doc.children.find((b: JsonChild) => b.type === 'table');
	return (table?.children ?? []).flatMap((row: JsonChild) =>
		(row.children ?? []).map((cell: JsonChild) =>
			(cell.children ?? []).map((block: JsonChild) => block.type),
		),
	);
}

test.describe('Pasting a copied block into a table cell (#173)', () => {
	test('a copied title, which a cell does not allow, lands after the table', async ({ editor }) => {
		await loadBlockAndTable(editor, {
			id: 'title',
			type: 'title',
			children: [{ type: 'text', text: 'Report', marks: [] }],
		});
		await selectTextOf(editor, '[data-block-id="title"]');
		const copied: Record<string, string> = await editor.copySelection();
		expect(copied['text/html']).toContain('data-notectl-rich');

		const doc: { children: JsonChild[] } = await pasteIntoLeftCell(editor, copied);

		expect(rootTypes(doc)).toEqual(['title', 'table', 'title']);
		expect(cellContents(doc)).toEqual([['paragraph'], ['paragraph']]);
	});

	test('a copied display formula, which a cell does not allow, lands after the table', async ({
		editor,
	}) => {
		await loadBlockAndTable(editor, {
			id: 'formula',
			type: 'math_display',
			attrs: { latex: 'x^2' },
			children: [{ type: 'text', text: '', marks: [] }],
		});
		await editor.focus();
		await editor.content.locator('.notectl-math--display').click();
		const copied: Record<string, string> = await editor.copySelection();
		expect(Object.keys(copied)).toContain('application/x-notectl-block');

		const doc: { children: JsonChild[] } = await pasteIntoLeftCell(editor, copied);

		expect(rootTypes(doc)).toEqual(['math_display', 'table', 'math_display']);
		expect(cellContents(doc)).toEqual([['paragraph'], ['paragraph']]);
	});

	test('a copied code block, which a cell allows, stays in the cell', async ({ editor }) => {
		await loadBlockAndTable(editor, {
			id: 'code',
			type: 'code_block',
			attrs: { language: 'plaintext' },
			children: [{ type: 'text', text: 'const x = 1;', marks: [] }],
		});
		await selectTextOf(editor, '.notectl-code-block__content');
		const copied: Record<string, string> = await editor.copySelection();
		expect(copied['text/html']).toContain('data-notectl-rich');

		const doc: { children: JsonChild[] } = await pasteIntoLeftCell(editor, copied);

		expect(rootTypes(doc)).toEqual(['code_block', 'table']);
		expect(cellContents(doc)).toEqual([['paragraph', 'code_block'], ['paragraph']]);
	});
});
