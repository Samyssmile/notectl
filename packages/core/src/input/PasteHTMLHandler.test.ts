/**
 * Regression test for issue #166 — "Pasting a table into a table cell creates a
 * nested table (invalid document)".
 *
 * Pasting table HTML while the caret sits inside a table cell routed the parsed
 * `table` block straight into the cell via `handleDocumentPaste`, producing a
 * schema-invalid `table_cell > table` nesting (`table_cell.content.allow` does
 * not list `table`). The fix escapes a container-disallowed paste to the
 * document root, placing the pasted table right after the outer table.
 *
 * Also covers issue #194 — multi-block `<li>` HTML must route through the
 * container-aware DocumentParser: the flat slice path cannot represent a list
 * item holding several blocks and would silently flatten it.
 */

import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
	isBlockNode,
} from '../model/Document.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { blockId } from '../model/TypeBrands.js';
import { ListPlugin } from '../plugins/list/ListPlugin.js';
import { TablePlugin } from '../plugins/table/TablePlugin.js';
import { EditorState } from '../state/EditorState.js';
import { pluginHarness } from '../test/TestUtils.js';
import { PasteHTMLHandler } from './PasteHTMLHandler.js';

/** Builds a 2x2 table document with the caret inside the first cell's paragraph. */
function tableState(): EditorState {
	const cell = (text: string, id: string): BlockNode =>
		createBlockNode(
			'table_cell',
			[createBlockNode('paragraph', [createTextNode(text)], blockId(`p-${id}`))],
			blockId(id),
		);

	const row1 = createBlockNode('table_row', [cell('A', 'c1'), cell('B', 'c2')], blockId('r1'));
	const row2 = createBlockNode('table_row', [cell('C', 'c3'), cell('D', 'c4')], blockId('r2'));
	const table = createBlockNode('table', [row1, row2], blockId('t1'));

	const doc = createDocument([table]);
	// Caret after the typed 'A', i.e. inside the first cell's paragraph.
	return EditorState.create({ doc, selection: createCollapsedSelection(blockId('p-c1'), 1) });
}

/** Collects a block and all of its descendant block nodes (DFS). */
function allBlocks(block: BlockNode, acc: BlockNode[] = []): BlockNode[] {
	acc.push(block);
	for (const child of block.children) {
		if (isBlockNode(child)) allBlocks(child, acc);
	}
	return acc;
}

/** Minimal DataTransfer carrying both `text/html` and a realistic `text/plain`. */
function clipboard(html: string, text: string): DataTransfer {
	return {
		getData(type: string): string {
			if (type === 'text/html') return html;
			if (type === 'text/plain') return text;
			return '';
		},
	} as unknown as DataTransfer;
}

const PASTED_TABLE_HTML: string =
	'<table><tbody><tr><td>X1</td><td>X2</td></tr><tr><td>Y1</td><td>Y2</td></tr></tbody></table>';
const PASTED_TABLE_TEXT = 'X1\tX2\nY1\tY2';

describe('issue #166 — pasting a table while the caret is inside a table cell', () => {
	it('escapes the pasted table to the document root instead of nesting it in the cell', async () => {
		const state: EditorState = tableState();
		const h = await pluginHarness(new TablePlugin(), state, { builtinSpecs: true });

		const handler = new PasteHTMLHandler(h.getState, h.dispatch, h.pm.schemaRegistry, () => false);
		handler.handleHTMLOrTextPaste(
			clipboard(PASTED_TABLE_HTML, PASTED_TABLE_TEXT),
			PASTED_TABLE_TEXT,
		);

		const doc = h.getState().doc;
		const everyBlock: BlockNode[] = doc.children.flatMap((b) => allBlocks(b));

		// The pasted table content must survive the paste (guards against a vacuous
		// pass where DOMPurify strips the table upstream).
		const allParagraphTexts: string[] = everyBlock
			.filter((b) => b.type === 'paragraph')
			.map((b) => getBlockText(b));
		expect(allParagraphTexts).toContain('X1');

		// No table cell may contain a nested table — that is the schema-invalid state.
		const cellWithNestedTable: BlockNode | undefined = everyBlock
			.filter((b) => b.type === 'table_cell')
			.find((cell) => cell.children.some((c) => isBlockNode(c) && c.type === 'table'));
		expect(cellWithNestedTable).toBeUndefined();

		// The pasted table lands at the document root, right after the outer table.
		const rootTables: BlockNode[] = doc.children.filter((b) => b.type === 'table');
		expect(rootTables).toHaveLength(2);
		expect(doc.children[1]?.type).toBe('table');

		// The escaped table carries the pasted content in order.
		const pasted: BlockNode | undefined = doc.children[1];
		const pastedTexts: string[] = pasted
			? allBlocks(pasted)
					.filter((b) => b.type === 'paragraph')
					.map((b) => getBlockText(b))
			: [];
		expect(pastedTexts).toEqual(['X1', 'X2', 'Y1', 'Y2']);

		// The original first cell keeps its single paragraph untouched.
		const c1: BlockNode | undefined = h.getState().getBlock(blockId('c1'));
		expect(c1?.children).toHaveLength(1);
		expect(c1 ? getBlockText(c1.children[0] as BlockNode) : '').toBe('A');
	});

	it('normalizes pasted table dimensions through the configured model boundary', async () => {
		const h = await pluginHarness(
			new TablePlugin({ minColumnWidthPx: 80, minRowHeightPx: 30 }),
			tableState(),
			{ builtinSpecs: true },
		);
		const handler = new PasteHTMLHandler(h.getState, h.dispatch, h.pm.schemaRegistry, () => false);

		handler.handleHTMLOrTextPaste(
			clipboard(
				'<table><colgroup><col width="20"></colgroup><tbody>' +
					'<tr height="5"><td>small</td></tr></tbody></table>',
				'small',
			),
			'small',
		);

		const pasted: BlockNode | undefined = h.getState().doc.children[1];
		expect(pasted?.attrs?.columnWidthsPx).toEqual([80]);
		const firstRow: BlockNode | undefined = pasted?.children.find(isBlockNode);
		expect(firstRow?.attrs?.minHeightPx).toBe(30);
	});
});

describe('issue #194 — pasting multi-block list items', () => {
	function paragraphState(): EditorState {
		const doc = createDocument([
			createBlockNode('paragraph', [createTextNode('x')], blockId('p1')),
		]);
		return EditorState.create({ doc, selection: createCollapsedSelection(blockId('p1'), 1) });
	}

	it('routes a multi-paragraph <li> through the container-aware DocumentParser', async () => {
		const h = await pluginHarness(new ListPlugin(), paragraphState(), { builtinSpecs: true });
		const handler = new PasteHTMLHandler(h.getState, h.dispatch, h.pm.schemaRegistry, () => false);

		handler.handleHTMLOrTextPaste(
			clipboard('<ul><li><p>first</p><p>second</p></li></ul>', 'first\nsecond'),
			'first\nsecond',
		);

		const doc = h.getState().doc;
		const item: BlockNode | undefined = doc.children.find((b) => b.type === 'list_item');
		expect(item).toBeDefined();
		const children: BlockNode[] = item ? item.children.filter(isBlockNode) : [];
		expect(children).toHaveLength(2);
		expect(children.map((c) => getBlockText(c))).toEqual(['first', 'second']);
	});

	it('routes an <li> holding a code block through the DocumentParser', async () => {
		const h = await pluginHarness(new ListPlugin(), paragraphState(), { builtinSpecs: true });
		const handler = new PasteHTMLHandler(h.getState, h.dispatch, h.pm.schemaRegistry, () => false);

		handler.handleHTMLOrTextPaste(
			clipboard('<ul><li><p>intro</p><pre><code>code</code></pre></li></ul>', 'intro\ncode'),
			'intro\ncode',
		);

		const doc = h.getState().doc;
		const item: BlockNode | undefined = doc.children.find((b) => b.type === 'list_item');
		expect(item).toBeDefined();
		const children: BlockNode[] = item ? item.children.filter(isBlockNode) : [];
		expect(children.length).toBeGreaterThanOrEqual(2);
		expect(children[0] ? getBlockText(children[0]) : '').toBe('intro');
	});
});
