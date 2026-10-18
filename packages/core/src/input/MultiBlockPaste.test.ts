import { describe, expect, it } from 'vitest';
import { pasteSlice } from '../commands/PasteCommand.js';
import { type ContentSlice, plainTextSlice } from '../model/ContentSlice.js';
import {
	type BlockNode,
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getBlockChildren,
	getBlockText,
	inlineSegment,
	textSegment,
} from '../model/Document.js';
import { walkNodes } from '../model/NodeResolver.js';
import { schemaFromRegistry } from '../model/Schema.js';
import { SchemaRegistry } from '../model/SchemaRegistry.js';
import { createCollapsedSelection, createSelection } from '../model/Selection.js';
import { blockId, inlineType, markType, nodeType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import { HistoryManager } from '../state/History.js';
import { type Transaction, invertTransaction } from '../state/Transaction.js';
import { PasteHTMLHandler } from './PasteHTMLHandler.js';
import { PasteRichBlockHandler } from './PasteRichBlockHandler.js';

const listAttrs = { listType: 'checklist', indent: 2, checked: true };
const registry = new SchemaRegistry();
for (const [type, tag, allow] of [
	['paragraph', 'p', ['text']],
	['heading', 'h2', ['text']],
	['title', 'h1', ['text']],
	['blockquote', 'blockquote', ['paragraph', 'heading', 'list_item', 'blockquote']],
	['list_item', 'li', ['text', 'paragraph', 'heading', 'blockquote']],
	['table', 'table', ['table_row']],
	['table_row', 'tr', ['table_cell']],
	['table_cell', 'td', ['paragraph', 'heading', 'list_item', 'blockquote']],
] as const) {
	registry.registerNodeSpec({
		type,
		content: { allow },
		attrs: { align: {}, dir: {}, level: {}, listType: {}, indent: {}, checked: {} },
		toDOM: () => document.createElement(tag),
		parseHTML: [{ tag }],
		sanitize: { tags: [tag] },
	});
}
registry.registerNodeSpec({
	type: 'horizontal_rule',
	isVoid: true,
	toDOM: () => document.createElement('hr'),
});

function paragraph(id: string, text = id): BlockNode {
	return createBlockNode(nodeType('paragraph'), [createTextNode(text)], blockId(id));
}

function table(children: readonly BlockNode[], id = 'table'): BlockNode {
	return createBlockNode(
		nodeType('table'),
		[
			createBlockNode(
				nodeType('table_row'),
				[
					createBlockNode(nodeType('table_cell'), children, blockId(`${id}-cell`)),
					createBlockNode(
						nodeType('table_cell'),
						[paragraph(`${id}-other`)],
						blockId(`${id}-other-cell`),
					),
				],
				blockId(`${id}-row`),
			),
		],
		blockId(id),
	);
}

const placements = ['after-table', 'cell', 'quote', 'list', 'composite-list', 'deep'] as const;
type Placement = (typeof placements)[number];

function fixture(placement: Placement): EditorState {
	const target =
		placement === 'list'
			? createBlockNode(
					nodeType('list_item'),
					[createTextNode('abcd')],
					blockId('target'),
					listAttrs,
				)
			: paragraph('target', 'abcd');
	const siblings = [paragraph('before'), target, paragraph('after')];
	let children: readonly BlockNode[];
	switch (placement) {
		case 'after-table':
			children = [table([paragraph('first-cell')]), ...siblings];
			break;
		case 'cell':
			children = [table(siblings)];
			break;
		case 'quote':
			children = [createBlockNode(nodeType('blockquote'), siblings, blockId('quote'))];
			break;
		case 'composite-list':
			children = [createBlockNode(nodeType('list_item'), siblings, blockId('item'), listAttrs)];
			break;
		case 'deep':
			children = [
				table([
					createBlockNode(
						nodeType('blockquote'),
						[createBlockNode(nodeType('list_item'), siblings, blockId('item'), listAttrs)],
						blockId('quote'),
					),
				]),
			];
			break;
		default:
			children = siblings;
	}
	return EditorState.create({
		doc: createDocument([...children, paragraph('outside')]),
		selection: createCollapsedSelection(blockId('target'), 2),
		schema: schemaFromRegistry(registry),
	});
}

function expectUniqueIds(state: EditorState): void {
	const ids: string[] = [];
	walkNodes(state.doc, (node) => ids.push(node.id));
	expect(new Set(ids).size).toBe(ids.length);
}

function expectReplay(before: EditorState, tr: Transaction): void {
	const after = before.apply(tr);
	const inverse = invertTransaction(tr);
	const history = new HistoryManager();
	history.push(tr);
	let current = after;
	for (let cycle = 0; cycle < 3; cycle++) {
		const undone = current.apply(inverse);
		expect(undone.doc).toEqual(before.doc);
		expect(undone.selection).toEqual(before.selection);
		current = undone.apply(tr);
		expect(current.doc).toEqual(after.doc);
		expect(current.selection).toEqual(after.selection);
		expectUniqueIds(current);
		const undo = history.undo(current);
		expect(undo).not.toBeNull();
		if (!undo) throw new Error('Missing undo');
		expect(undo.state.doc).toEqual(before.doc);
		expect(undo.state.selection).toEqual(before.selection);
		expect(history.canUndo()).toBe(false);
		const redo = history.redo(undo.state);
		expect(redo).not.toBeNull();
		if (!redo) throw new Error('Missing redo');
		current = redo.state;
		expect(current.doc).toEqual(after.doc);
		expect(current.selection).toEqual(after.selection);
		expectUniqueIds(current);
	}
}

type Flavor = 'text' | 'html' | 'internal';
function paste(state: EditorState, flavor: Flavor): Transaction {
	const transactions: Transaction[] = [];
	const dispatch = (tr: Transaction): void => {
		transactions.push(tr);
	};
	const rich = new PasteRichBlockHandler(() => state, dispatch, registry);
	const html = new PasteHTMLHandler(
		() => state,
		dispatch,
		registry,
		(json) => rich.handleRichPasteFromJson(json),
	);
	if (flavor === 'text') html.pastePlainText('one\ntwo\nthree\nfour');
	else if (flavor === 'html') html.pasteHTMLString('<p>one</p><p>two</p><p>three</p><p>four</p>');
	else
		rich.handleRichPaste(
			['one', 'two', 'three', 'four'].map((text) => ({ type: 'paragraph', text })),
		);
	expect(transactions).toHaveLength(1);
	const tr = transactions[0];
	if (!tr) throw new Error('Missing paste');
	return tr;
}

describe('multi-block paste structure and replay (#267)', () => {
	for (const placement of placements) {
		for (const flavor of ['text', 'html', 'internal'] as const) {
			for (const position of [0, 2, 4, 'forward', 'backward'] as const) {
				it(`${flavor} in ${placement} at ${position} preserves siblings, structure and history`, () => {
					let state = fixture(placement);
					const selection =
						typeof position === 'number'
							? createCollapsedSelection(blockId('target'), position)
							: createSelection(
									{ blockId: blockId('target'), offset: position === 'forward' ? 1 : 3 },
									{ blockId: blockId('target'), offset: position === 'forward' ? 3 : 1 },
								);
					state = state.withSelection(selection);
					const tr = paste(state, flavor);
					const after = state.apply(tr);
					const parent = state.getParent(blockId('target'));
					const siblings = parent
						? getBlockChildren(after.getBlock(parent.id) as BlockNode)
						: after.doc.children;
					const index = siblings.findIndex((node) => node.id === 'target');
					const inserted = siblings.slice(index, index + 4);
					const from = typeof position === 'number' ? position : 1;
					const to = typeof position === 'number' ? position : 3;
					expect(inserted.map(getBlockText)).toEqual([
						`${'abcd'.slice(0, from)}one`,
						'two',
						'three',
						`four${'abcd'.slice(to)}`,
					]);
					expect(siblings[index - 1]?.id).toBe('before');
					expect(siblings[index + 4]?.id).toBe('after');
					expect(after.getBlock(blockId('outside'))).toEqual(state.getBlock(blockId('outside')));
					if (placement === 'list') {
						expect(inserted.map((node) => node.type)).toEqual(Array(4).fill('list_item'));
						for (const node of inserted) expect(node.attrs).toEqual(listAttrs);
					}
					expectReplay(state, tr);
				});
			}
		}
	}

	for (const forbiddenIndex of [0, 1, 3]) {
		for (const placement of ['cell', 'quote', 'composite-list', 'deep'] as const) {
			it(`escapes the complete slice with forbidden block ${forbiddenIndex} from ${placement}`, () => {
				const state = fixture(placement).withSelection(
					createSelection(
						{ blockId: blockId('target'), offset: 1 },
						{ blockId: blockId('target'), offset: 3 },
					),
				);
				const slice: ContentSlice = {
					blocks: plainTextSlice('one\ntwo\nthree\nfour').blocks.map((block, index) =>
						index === forbiddenIndex ? { ...block, type: nodeType('title') } : block,
					),
				};
				const tr = pasteSlice(state, slice);
				const after = state.apply(tr);
				expect(getBlockText(after.getBlock(blockId('target')) as BlockNode)).toBe('ad');
				expect(after.doc.children.slice(1, 5).map(getBlockText)).toEqual([
					'one',
					'two',
					'three',
					'four',
				]);
				expect(after.doc.children[forbiddenIndex + 1]?.type).toBe('title');
				expect(after.selection).toEqual(
					createCollapsedSelection(after.doc.children[4]?.id ?? blockId(''), 4),
				);
				expectReplay(state, tr);
			});
		}
	}

	for (const flavor of ['text', 'html', 'internal'] as const) {
		for (const acrossCells of [false, true]) {
			for (const reverse of [false, true]) {
				it(`${flavor} replaces a ${reverse ? 'backward' : 'forward'} range across ${acrossCells ? 'cells' : 'siblings'}`, () => {
					const from = { blockId: blockId('target'), offset: 1 };
					const to = { blockId: blockId(acrossCells ? 'table-other' : 'after'), offset: 2 };
					const state = fixture('cell').withSelection(
						createSelection(reverse ? to : from, reverse ? from : to),
					);
					const tr = paste(state, flavor);
					const after = state.apply(tr);
					const cell = after.getBlock(blockId('table-cell'));
					if (!cell) throw new Error('Missing cell');
					expect(getBlockChildren(cell).map(getBlockText)).toEqual([
						'before',
						'aone',
						'two',
						'three',
						acrossCells ? 'four' : 'fourter',
					]);
					if (acrossCells)
						expect(getBlockText(after.getBlock(blockId('table-other')) as BlockNode)).toBe(
							'ble-other',
						);
					expectReplay(state, tr);
				});
			}
		}
	}

	it('inserts a three-block slice into a deeply nested target', () => {
		const state = fixture('deep');
		const tr = pasteSlice(state, plainTextSlice('one\ntwo\nthree'));
		const item = state.apply(tr).getBlock(blockId('item'));
		if (!item) throw new Error('Missing list item');
		expect(getBlockChildren(item).map(getBlockText)).toEqual([
			'before',
			'abone',
			'two',
			'threecd',
			'after',
		]);
		expectReplay(state, tr);
	});

	it('preserves explicit types, paragraph formatting, marks and inline nodes in list items', () => {
		const state = fixture('list');
		const marked = textSegment('bold', [{ type: markType('bold') }]);
		const inlineNode = createInlineNode(inlineType('hard_break'));
		const inline = inlineSegment(inlineNode);
		const slice: ContentSlice = {
			blocks: [
				{ type: nodeType('paragraph'), attrs: { align: 'center' }, segments: [marked] },
				{
					type: nodeType('paragraph'),
					attrs: { align: 'end', unsupported: 'drop' },
					segments: [marked, inline],
				},
				{ type: nodeType('heading'), attrs: { level: 2 }, segments: [marked] },
				{ type: nodeType('paragraph'), segments: [inline, marked] },
			],
		};
		const tr = pasteSlice(state, slice);
		const blocks = state.apply(tr).doc.children.slice(1, 5);
		expect(blocks.map((node) => node.type)).toEqual([
			'list_item',
			'list_item',
			'heading',
			'list_item',
		]);
		expect(blocks[1]?.attrs).toEqual({ ...listAttrs, align: 'end' });
		expect(blocks[1]?.children).toEqual([
			createTextNode('bold', [{ type: markType('bold') }]),
			inlineNode,
		]);
		expectReplay(state, tr);
	});

	for (const reverse of [false, true]) {
		for (const target of [
			'surviving-prefix',
			'new-landing',
			'surviving-tail',
			'void-landing',
		] as const) {
			it(`resolves ${target} after ${reverse ? 'backward' : 'forward'} deletion`, () => {
				const quote = createBlockNode(
					nodeType('blockquote'),
					[paragraph('q1', 'abcd'), paragraph('q2', 'efgh')],
					blockId('quote'),
				);
				const rule = createBlockNode(nodeType('horizontal_rule'), [], blockId('rule'));
				const doc =
					target === 'void-landing'
						? createDocument([
								createBlockNode(
									nodeType('blockquote'),
									[rule, createBlockNode(nodeType('horizontal_rule'), [], blockId('rule-end'))],
									blockId('quote'),
								),
							])
						: createDocument([table([paragraph('cell-text')]), quote, paragraph('tail', 'ijkl')]);
				const from =
					target === 'void-landing'
						? { blockId: blockId('rule'), offset: 0 }
						: target === 'surviving-prefix'
							? { blockId: blockId('q1'), offset: 2 }
							: { blockId: blockId('cell-text'), offset: 0 };
				const to =
					target === 'void-landing'
						? { blockId: blockId('rule-end'), offset: 0 }
						: target === 'new-landing'
							? { blockId: blockId('q2'), offset: 2 }
							: { blockId: blockId('tail'), offset: 2 };
				const state = EditorState.create({
					doc,
					schema: schemaFromRegistry(registry),
					selection: createSelection(reverse ? to : from, reverse ? from : to),
				});
				const tr = paste(state, 'internal');
				const after = state.apply(tr);
				const texts = after
					.getBlockOrder()
					.map((id) => getBlockText(after.getBlock(id) as BlockNode));
				expect(texts.join('|')).toContain(
					target === 'surviving-prefix' ? 'abone|two|three|four' : 'one|two|three|four',
				);
				if (target === 'surviving-prefix' || target === 'void-landing')
					expect(getBlockChildren(after.getBlock(blockId('quote')) as BlockNode)).toHaveLength(4);
				expectReplay(state, tr);
			});
		}
	}
});

describe('rich whole-block paste over a backward range (#267)', () => {
	it('keeps rich blocks with semantic IDs beside the caret in a deeply nested container', () => {
		const state = fixture('deep');
		const transactions: Transaction[] = [];
		const rich = new PasteRichBlockHandler(
			() => state,
			(tr) => transactions.push(tr),
			registry,
		);
		expect(
			rich.handleRichPaste(
				['one', 'two', 'three'].map((text) => ({ type: 'paragraph', text, htmlId: text })),
			),
		).toBe(true);
		expect(transactions).toHaveLength(1);
		const tr = transactions[0];
		if (!tr) throw new Error('Missing paste');
		const after = state.apply(tr);
		const item = after.getBlock(blockId('item'));
		if (!item) throw new Error('Missing list item');
		expect(getBlockChildren(item).map(getBlockText)).toEqual([
			'before',
			'abcd',
			'one',
			'two',
			'three',
			'after',
		]);
		expect(
			getBlockChildren(item)
				.slice(2, 5)
				.map((node) => node.htmlId),
		).toEqual(['one', 'two', 'three']);
		expectReplay(state, tr);
	});

	it('escapes forbidden rich blocks from a non-table container', () => {
		const state = fixture('quote');
		const transactions: Transaction[] = [];
		const rich = new PasteRichBlockHandler(
			() => state,
			(tr) => transactions.push(tr),
			registry,
		);
		rich.handleRichPaste([
			{ type: 'paragraph', text: 'one' },
			{ type: 'title', text: 'two', htmlId: 'title' },
			{ type: 'paragraph', text: 'three' },
		]);
		const tr = transactions[0];
		if (!tr) throw new Error('Missing paste');
		const after = state.apply(tr);
		expect(after.getBlock(blockId('quote'))).toEqual(state.getBlock(blockId('quote')));
		expect(after.doc.children.slice(1).map(getBlockText)).toEqual([
			'one',
			'two',
			'three',
			'outside',
		]);
		expectReplay(state, tr);
	});

	it('preserves an empty list item when inserting neutral rich paragraphs', () => {
		const original = fixture('list');
		const state = original.apply(
			original.transaction().deleteText(blockId('target'), 0, 4).build(),
		);
		const tr = paste(state, 'internal');
		const after = state.apply(tr);
		const inserted = after.doc.children.slice(1, 5);
		expect(inserted.map(getBlockText)).toEqual(['one', 'two', 'three', 'four']);
		expect(inserted.map((node) => node.type)).toEqual(Array(4).fill('list_item'));
		for (const node of inserted) expect(node.attrs).toEqual(listAttrs);
		expectReplay(state, tr);
	});

	it('replaces the range in one transaction and inserts after the merged block', () => {
		// Arrange: a void block keeps the rich blocks out of the slice strategy.
		const state = EditorState.create({
			doc: createDocument([
				paragraph('p1', 'aaaa'),
				paragraph('p2', 'bbbb'),
				paragraph('p3', 'cccc'),
				paragraph('p4', 'dddd'),
			]),
			selection: createSelection(
				{ blockId: blockId('p3'), offset: 1 },
				{ blockId: blockId('p1'), offset: 1 },
			),
			schema: schemaFromRegistry(registry),
		});
		const transactions: Transaction[] = [];
		const dispatch = (tr: Transaction): void => {
			transactions.push(tr);
		};
		const rich = new PasteRichBlockHandler(() => state, dispatch, registry);
		const html = new PasteHTMLHandler(
			() => state,
			dispatch,
			registry,
			(json, initialState) => rich.handleRichPasteFromJson(json, initialState),
		);
		const blocks = [
			{ type: 'paragraph', text: 'one' },
			{ type: 'horizontal_rule' },
			{ type: 'paragraph', text: 'two' },
		];
		const encoded: string = JSON.stringify(blocks).replace(/"/g, '&quot;');

		// Act
		html.pasteHTMLString(`<div data-notectl-rich="${encoded}">one<br>two</div>`);

		// Assert
		expect(transactions).toHaveLength(1);
		const tr = transactions[0];
		if (!tr) throw new Error('Missing paste');
		const after = state.apply(tr);
		expect(
			after.doc.children.map((node) =>
				node.type === 'horizontal_rule' ? 'hr' : getBlockText(node),
			),
		).toEqual(['accc', 'one', 'hr', 'two', 'dddd']);
		expectReplay(state, tr);
	});
});
