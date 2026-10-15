import { afterEach, describe, expect, it } from 'vitest';
import { Locale } from '../i18n/Locale.js';
import type { BlockNode, Document } from '../model/Document.js';
import { getBlockChildren, getBlockText, isLeafBlock } from '../model/Document.js';
import { type Selection, createCollapsedSelection } from '../model/Selection.js';
import { BlockquotePlugin } from '../plugins/blockquote/BlockquotePlugin.js';
import { ListPlugin } from '../plugins/list/ListPlugin.js';
import { TablePlugin } from '../plugins/table/TablePlugin.js';
import '../register.js';
import { NotectlEditor } from './NotectlEditor.js';

/**
 * Round-trip identity contract (ARCHITECTURE §9.2) through the public editor API:
 * writing back unchanged content keeps every block ID, so the caret stays where
 * it was, also inside containers such as quotes, list items and table cells (#280).
 */

interface CaretCase {
	readonly caretIn: string;
	readonly markdown: string;
	readonly leafText: string;
}

interface FormatPair {
	readonly name: string;
	readonly roundTrip: (editor: NotectlEditor) => Promise<void>;
}

const CARET_OFFSET = 3;

const CARET_CASES: readonly CaretCase[] = [
	{ caretIn: 'top-level paragraph', markdown: 'Intro\n\nPlain text\n', leafText: 'Plain text' },
	{
		caretIn: 'item of a nested list',
		markdown: '- One\n  - Nested item\n',
		leafText: 'Nested item',
	},
	{
		caretIn: 'paragraph in a blockquote',
		markdown: 'Intro\n\n> Quoted text\n',
		leafText: 'Quoted text',
	},
	{
		caretIn: 'paragraph in a nested blockquote',
		markdown: 'Intro\n\n> Outer\n>\n> > Deep quote\n',
		leafText: 'Deep quote',
	},
	{
		caretIn: 'second paragraph of a list item',
		markdown: '- First\n\n  Second paragraph\n',
		leafText: 'Second paragraph',
	},
	{
		caretIn: 'paragraph in a table cell',
		markdown: '| H1 | H2 |\n| --- | --- |\n| a | Cell text |\n',
		leafText: 'Cell text',
	},
];

const FORMAT_PAIRS: readonly FormatPair[] = [
	{ name: 'JSON', roundTrip: async (editor) => editor.setJSON(editor.getJSON()) },
	{
		name: 'HTML',
		roundTrip: async (editor) => editor.setContentHTML(await editor.getContentHTML()),
	},
	{
		name: 'Markdown',
		roundTrip: async (editor) => editor.setContentMarkdown(await editor.getContentMarkdown()),
	},
];

let editor: NotectlEditor | null = null;

afterEach(async () => {
	await editor?.destroy();
	editor?.remove();
	editor = null;
});

async function createEditor(markdown: string): Promise<NotectlEditor> {
	const created: NotectlEditor = new NotectlEditor();
	document.body.appendChild(created);
	await created.init({
		locale: Locale.EN,
		plugins: [new BlockquotePlugin(), new ListPlugin(), new TablePlugin()],
	});
	await created.whenReady();
	await created.setContentMarkdown(markdown);
	return created;
}

/** Depth-first search for the leaf block whose text is `text`. */
function findLeaf(blocks: readonly BlockNode[], text: string): BlockNode | undefined {
	for (const block of blocks) {
		if (isLeafBlock(block)) {
			if (getBlockText(block) === text) return block;
			continue;
		}
		const nested: BlockNode | undefined = findLeaf(getBlockChildren(block), text);
		if (nested) return nested;
	}
	return undefined;
}

function placeCaret(target: NotectlEditor, leaf: BlockNode, offset: number): void {
	const selection: Selection = createCollapsedSelection(leaf.id, offset);
	target.dispatch(target.getState().transaction('api').setSelection(selection).build());
}

describe.each(FORMAT_PAIRS)('$name round trip of unchanged content', ({ roundTrip }) => {
	it.each(CARET_CASES)('keeps block IDs and the caret in a $caretIn', async (caretCase) => {
		editor = await createEditor(caretCase.markdown);
		const leaf: BlockNode | undefined = findLeaf(
			editor.getState().doc.children,
			caretCase.leafText,
		);
		if (!leaf) throw new Error(`no leaf with text "${caretCase.leafText}"`);
		placeCaret(editor, leaf, CARET_OFFSET);
		const before: Document = editor.getJSON();

		await roundTrip(editor);

		expect(editor.getJSON()).toEqual(before);
		expect(editor.getState().selection).toMatchObject({
			anchor: { blockId: leaf.id, offset: CARET_OFFSET },
			head: { blockId: leaf.id, offset: CARET_OFFSET },
		});
	});
});
