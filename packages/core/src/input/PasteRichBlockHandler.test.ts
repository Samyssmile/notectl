import { describe, expect, it, vi } from 'vitest';
import {
	type BlockNode,
	type ChildNode,
	type Document,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
	isBlockNode,
} from '../model/Document.js';
import { schemaFromRegistry } from '../model/Schema.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	type EditorSelection,
	createCollapsedSelection,
	createGapCursor,
	createSelection,
	isNodeSelection,
} from '../model/Selection.js';
import { blockId, nodeType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import { type Transaction, invertTransaction } from '../state/Transaction.js';
import { PasteRichBlockHandler } from './PasteRichBlockHandler.js';

const registry = new SchemaRegistry();
for (const [type, allow] of [
	['paragraph', ['text']],
	['blockquote', ['paragraph']],
	['list_item', ['text', 'paragraph']],
	['table', ['table_row']],
	['table_row', ['table_cell']],
	['table_cell', ['paragraph', 'image']],
] as const) {
	registry.registerNodeSpec({
		type,
		content: { allow },
		attrs: type === 'list_item' ? { listType: {}, indent: {}, checked: {} } : undefined,
		toDOM: () => document.createElement('div'),
	});
}
registry.registerNodeSpec({
	type: 'image',
	isVoid: true,
	selectable: true,
	attrs: { src: { default: '' } },
	toDOM: () => document.createElement('img'),
});

const IMAGE_JSON: string = JSON.stringify({ type: 'image', attrs: { src: 'x.png' } });

function paragraph(id: string, text: string = id): BlockNode {
	return createBlockNode(nodeType('paragraph'), [createTextNode(text)], blockId(id));
}

function image(id: string): BlockNode {
	return createBlockNode(nodeType('image'), [], blockId(id), { src: `${id}.png` });
}

function tableWithCell(children: readonly BlockNode[]): BlockNode {
	const cell: BlockNode = createBlockNode(nodeType('table_cell'), children, blockId('cell'));
	const row: BlockNode = createBlockNode(nodeType('table_row'), [cell], blockId('row'));
	return createBlockNode(nodeType('table'), [row], blockId('table'));
}

interface Pasted {
	readonly before: EditorState;
	readonly after: EditorState;
	readonly transactions: readonly Transaction[];
}

/** Pastes a copied image node into `doc` at `selection` and records every dispatch. */
function pasteImage(doc: Document, selection: EditorSelection): Pasted {
	const before: EditorState = EditorState.create({
		doc,
		selection,
		schema: schemaFromRegistry(registry),
	});
	let current: EditorState = before;
	const dispatch = vi.fn((tr: Transaction) => {
		current = current.apply(tr);
	});
	new PasteRichBlockHandler(() => current, dispatch, registry).handleBlockPaste(IMAGE_JSON);
	const transactions: Transaction[] = dispatch.mock.calls.map((call) => call[0]);
	return { before, after: current, transactions };
}

/** Block types and texts as a nested outline, e.g. `{ blockquote: ['paragraph:a'] }`. */
function outline(nodes: readonly ChildNode[]): unknown[] {
	return nodes.filter(isBlockNode).map((node: BlockNode) => {
		const children: readonly BlockNode[] = node.children.filter(isBlockNode);
		if (children.length > 0) return { [node.type]: outline(children) };
		return node.type === 'image' ? 'image' : `${node.type}:${getBlockText(node)}`;
	});
}

/** The pasted image must end node-selected, addressed through its real path. */
function expectImageSelected(state: EditorState): void {
	const sel: EditorSelection = state.selection;
	expect(isNodeSelection(sel)).toBe(true);
	if (!isNodeSelection(sel)) return;
	expect(state.getBlock(sel.nodeId)?.type).toBe('image');
	expect(sel.path).toEqual(state.getNodePath(sel.nodeId));
}

describe('PasteRichBlockHandler.handleBlockPaste', () => {
	describe('container rules (#166, #267)', () => {
		const containers: readonly [string, BlockNode][] = [
			[
				'a blockquote',
				createBlockNode(nodeType('blockquote'), [paragraph('target', 'quoted')], blockId('c')),
			],
			[
				'a multi-block list item',
				createBlockNode(
					nodeType('list_item'),
					[paragraph('first'), paragraph('target', 'item')],
					blockId('c'),
					{ listType: 'bullet', indent: 0, checked: false },
				),
			],
		];

		for (const [label, container] of containers) {
			it(`places a block that ${label} forbids after the container`, () => {
				// Arrange
				const doc: Document = createDocument([container, paragraph('after')]);

				// Act
				const { after } = pasteImage(doc, createCollapsedSelection(blockId('target'), 2));

				// Assert
				expect(after.doc.children[0]).toEqual(container);
				expect(outline(after.doc.children).slice(1)).toEqual(['image', 'paragraph:after']);
				expectImageSelected(after);
			});
		}

		it('inserts an allowed block right after the caret block inside a cell', () => {
			// Arrange
			const doc: Document = createDocument([tableWithCell([paragraph('p1'), paragraph('p2')])]);

			// Act
			const { after } = pasteImage(doc, createCollapsedSelection(blockId('p1'), 1));

			// Assert
			expect(outline(after.doc.children)).toEqual([
				{ table: [{ table_row: [{ table_cell: ['paragraph:p1', 'image', 'paragraph:p2'] }] }] },
			]);
			expectImageSelected(after);
		});

		it('respects a gap cursor before a block inside a cell', () => {
			// Arrange
			const doc: Document = createDocument([tableWithCell([image('img'), paragraph('p')])]);
			const gap: EditorSelection = createGapCursor(blockId('img'), 'before', [
				blockId('table'),
				blockId('row'),
				blockId('cell'),
				blockId('img'),
			]);

			// Act
			const { after } = pasteImage(doc, gap);

			// Assert
			const cell: BlockNode | undefined = after.getBlock(blockId('cell'));
			const ids: string[] = (cell?.children ?? []).filter(isBlockNode).map((c) => c.id);
			expect(ids).toHaveLength(3);
			expect(ids.slice(1)).toEqual(['img', 'p']);
			expectImageSelected(after);
		});
	});

	describe('selection replacement (#267)', () => {
		it('replaces a backward range in one transaction after the merged start block', () => {
			// Arrange
			const doc: Document = createDocument([
				paragraph('a', 'aaaa'),
				paragraph('b', 'bbbb'),
				paragraph('c', 'cccc'),
			]);
			const backward: EditorSelection = createSelection(
				{ blockId: blockId('c'), offset: 2 },
				{ blockId: blockId('a'), offset: 2 },
			);

			// Act
			const { before, after, transactions } = pasteImage(doc, backward);

			// Assert
			expect(transactions).toHaveLength(1);
			expect(outline(after.doc.children)).toEqual(['paragraph:aacc', 'image']);
			expectImageSelected(after);
			const tr: Transaction | undefined = transactions[0];
			if (!tr) return;
			expect(after.apply(invertTransaction(tr)).doc).toEqual(before.doc);
		});

		it('replaces a block that the range deletion leaves empty', () => {
			// Arrange
			const doc: Document = createDocument([paragraph('a', 'keep'), paragraph('b', 'gone')]);
			const wholeBlock: EditorSelection = createSelection(
				{ blockId: blockId('b'), offset: 4 },
				{ blockId: blockId('b'), offset: 0 },
			);

			// Act
			const { after } = pasteImage(doc, wholeBlock);

			// Assert
			expect(outline(after.doc.children)).toEqual(['paragraph:keep', 'image']);
			expect(after.getBlock(blockId('b'))).toBeUndefined();
		});

		it('replaces the only empty paragraph of the document', () => {
			// Arrange
			const doc: Document = createDocument([paragraph('empty', '')]);

			// Act
			const { after } = pasteImage(doc, createCollapsedSelection(blockId('empty'), 0));

			// Assert
			expect(outline(after.doc.children)).toEqual(['image']);
			expectImageSelected(after);
		});
	});
});
