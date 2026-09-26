/**
 * Cross-root range deletion (`deleteCrossRootRange` via `deleteSelectionCommand`).
 *
 * A range selection whose endpoints live in different root blocks must delete
 * exactly the selected content and preserve everything outside it. The failure
 * this suite guards against: when a selection boundary lands *inside* a
 * composite/container root (a multi-block list_item, a blockquote), the whole
 * root must NOT be wiped — only the portion inside the selection. Data loss
 * here is silent, and no repair pass runs on editing transactions.
 *
 * list_item (#194) and blockquote (#136) are both composite roots, so every
 * container case is exercised in both variants.
 */

import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	type ChildNode,
	type Document,
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getBlockChildren,
	isLeafBlock,
	isTextNode,
} from '../model/Document.js';
import { walkNodes } from '../model/NodeResolver.js';
import type { Schema } from '../model/Schema.js';
import {
	createCollapsedSelection,
	createSelection,
	isCollapsed,
	isTextSelection,
} from '../model/Selection.js';
import { type BlockId, blockId, inlineType, markType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import { HistoryManager } from '../state/History.js';
import { invertTransaction } from '../state/StepHandlers.js';
import type { Transaction } from '../state/Transaction.js';
import { deleteSelectionCommand, insertTextCommand } from './Commands.js';

// --- Builders ---

const para = (text: string, id: string): BlockNode =>
	createBlockNode('paragraph', [createTextNode(text)], blockId(id));
const leafItem = (text: string, id: string): BlockNode =>
	createBlockNode('list_item', [createTextNode(text)], blockId(id), {
		listType: 'bullet',
		indent: 0,
		checked: false,
	});
const item = (id: string, kids: readonly BlockNode[]): BlockNode =>
	createBlockNode('list_item', kids, blockId(id), {
		listType: 'bullet',
		indent: 0,
		checked: false,
	});
const quote = (id: string, kids: readonly BlockNode[]): BlockNode =>
	createBlockNode('blockquote', kids, blockId(id));
const cell = (text: string, id: string): BlockNode =>
	createBlockNode('table_cell', [para(text, `${id}p`)], blockId(id));
const trow = (id: string, cells: readonly BlockNode[]): BlockNode =>
	createBlockNode('table_row', cells, blockId(id));
const grid = (id: string, rows: readonly BlockNode[]): BlockNode =>
	createBlockNode('table', rows, blockId(id));

const SCHEMA = {
	nodeTypes: ['paragraph', 'list_item', 'blockquote', 'table', 'table_row', 'table_cell'],
	markTypes: [],
};

/** Fails if any row of any table has a differing cell count (a ragged table). */
function assertNoRaggedTable(doc: Document): void {
	const walk = (block: BlockNode): void => {
		if (block.type === 'table') {
			const counts = getBlockChildren(block).map((row) => getBlockChildren(row).length);
			expect(new Set(counts).size).toBeLessThanOrEqual(1);
		}
		if (!isLeafBlock(block)) getBlockChildren(block).forEach(walk);
	};
	doc.children.forEach(walk);
}

function stateOf(
	blocks: readonly BlockNode[],
	from: { id: string; offset: number },
	to: { id: string; offset: number },
): EditorState {
	return EditorState.create({
		doc: createDocument([...blocks]),
		selection: createSelection(
			{ blockId: blockId(from.id), offset: from.offset },
			{ blockId: blockId(to.id), offset: to.offset },
		),
		schema: SCHEMA,
	});
}

/** Compact structural render: leaf → `type("text")`, container → `type[child,child]`. */
function render(block: BlockNode): string {
	if (isLeafBlock(block)) {
		const text: string = (block.children as readonly ChildNode[])
			.filter(isTextNode)
			.map((c) => c.text)
			.join('');
		return `${block.type}("${text}")`;
	}
	return `${block.type}[${getBlockChildren(block).map(render).join(',')}]`;
}
const renderDoc = (doc: Document): string => doc.children.map(render).join(',');

function applyDelete(state: EditorState): EditorState {
	const tr = deleteSelectionCommand(state);
	if (!tr) throw new Error('expected a delete transaction');
	return state.apply(tr);
}

/** Compare the whole tree and selection, including ordering, IDs and inline metadata. */
function expectHistoryRoundTrip(state: EditorState, tr: Transaction): EditorState {
	const history = new HistoryManager();
	const deleted = state.apply(tr);
	history.push(tr);
	const restored = history.undo(deleted)?.state;
	expect(restored?.doc).toEqual(state.doc);
	expect(restored?.selection).toEqual(state.selection);
	if (!restored) throw new Error('Expected undo');
	const redone = history.redo(restored)?.state;
	expect(redone?.doc).toEqual(deleted.doc);
	expect(redone?.selection).toEqual(deleted.selection);
	for (const doc of [deleted.doc, restored.doc]) {
		const ids: BlockId[] = [];
		walkNodes(doc, (node) => ids.push(node.id));
		expect(new Set(ids).size).toBe(ids.length);
	}
	return deleted;
}

describe('leaf-range deletion preserves container boundaries (#225)', () => {
	const nested = [
		quote('q', [
			para('abc', 'p1'),
			quote('nested', [para('def', 'p2'), para('ghi', 'p3')]),
			para('jkl', 'p4'),
			para('mno', 'p5'),
		]),
	];
	const cases = [
		{
			name: 'different depths',
			blocks: nested,
			to: 'p3',
			expected: (text: string) => [
				quote('q', [
					para(text, 'p1'),
					quote('nested', [para('i', 'p2')]),
					para('jkl', 'p4'),
					para('mno', 'p5'),
				]),
			],
		},
		{
			name: 'parent sequence A → B → A',
			blocks: nested,
			to: 'p5',
			expected: (text: string) => [
				quote('q', [para(text, 'p1'), quote('nested', [para('', 'p2')]), para('o', 'p4')]),
			],
		},
		{
			name: 'different parents at the same depth',
			blocks: [
				quote('q', [
					quote('a', [para('abc', 'p1'), para('def', 'p2')]),
					quote('b', [para('ghi', 'p3'), para('jkl', 'p4')]),
				]),
			],
			to: 'p4',
			expected: (text: string) => [
				quote('q', [quote('a', [para(text, 'p1')]), quote('b', [para('l', 'p3')])]),
			],
		},
		{
			name: 'multiple table cells',
			blocks: [
				grid('t', [
					trow('row', [
						createBlockNode('table_cell', [para('abc', 'p1'), para('def', 'p2')], blockId('c1')),
						createBlockNode('table_cell', [para('ghi', 'p3')], blockId('c2')),
						createBlockNode('table_cell', [para('jkl', 'p4'), para('mno', 'p5')], blockId('c3')),
					]),
				]),
			],
			to: 'p5',
			expected: (text: string) => [
				grid('t', [
					trow('row', [
						createBlockNode('table_cell', [para(text, 'p1')], blockId('c1')),
						createBlockNode('table_cell', [para('', 'p3')], blockId('c2')),
						createBlockNode('table_cell', [para('o', 'p4')], blockId('c3')),
					]),
				]),
			],
		},
	];
	for (const scenario of cases) {
		for (const backward of [false, true]) {
			for (const replace of [false, true]) {
				it(`${scenario.name}, ${backward ? 'backward' : 'forward'}, ${replace ? 'typing' : 'deletion'}`, () => {
					const from = { id: 'p1', offset: 1 };
					const to = { id: scenario.to, offset: 2 };
					const state = stateOf(scenario.blocks, backward ? to : from, backward ? from : to);
					const tr = replace ? insertTextCommand(state, 'X') : deleteSelectionCommand(state);
					if (!tr) throw new Error('Expected deletion');
					const deleted = state.apply(tr);
					expect(deleted.doc).toEqual(createDocument(scenario.expected(replace ? 'aX' : 'a')));
					expect(deleted.selection).toEqual(
						createCollapsedSelection(blockId('p1'), replace ? 2 : 1),
					);
					assertNoRaggedTable(deleted.doc);
					expectHistoryRoundTrip(state, tr);
				});
			}
		}
	}

	it('restores marks and inline nodes across sibling merges and nested boundaries', () => {
		const atom = createInlineNode(inlineType('hard_break'), {});
		const rich = createBlockNode(
			'paragraph',
			[
				createTextNode('ab', [{ type: markType('bold') }]),
				atom,
				createTextNode('cd', [{ type: markType('italic') }]),
			],
			blockId('rich'),
		);
		const state = stateOf(
			[quote('q', [para('abc', 'p1'), rich, quote('nested', [para('def', 'p3')])])],
			{ id: 'p1', offset: 1 },
			{ id: 'p3', offset: 1 },
		);
		const tr = insertTextCommand(state, 'X');
		const deleted = expectHistoryRoundTrip(state, tr);
		expect(renderDoc(deleted.doc)).toBe('blockquote[paragraph("aX"),blockquote[paragraph("ef")]]');
	});
});

// --- Regression: pure leaf roots still merge across the boundary ---

describe('deleteCrossRootRange — leaf roots (regression)', () => {
	it('merges the boundary paragraphs and drops fully-selected middle leaf items', () => {
		const state = stateOf(
			[
				para('outside', 'p0'),
				leafItem('alpha', 'l1'),
				leafItem('beta', 'l2'),
				leafItem('gamma', 'l3'),
			],
			{ id: 'p0', offset: 3 },
			{ id: 'l2', offset: 2 },
		);
		// "out" + "ta" merge into one block; gamma survives.
		expect(renderDoc(applyDelete(state).doc)).toBe('paragraph("outta"),list_item("gamma")');
	});
});

// --- to-endpoint inside a container: keep the tail + untouched later children ---

describe('deleteCrossRootRange — to-endpoint inside a container', () => {
	it('list_item: keeps the tail of the boundary child and later children', () => {
		const state = stateOf(
			[
				para('outside', 'p0'),
				item('i1', [para('alpha', 'c1'), para('beta', 'c2'), para('gamma', 'c3')]),
			],
			{ id: 'p0', offset: 3 },
			{ id: 'c2', offset: 2 },
		);
		expect(renderDoc(applyDelete(state).doc)).toBe(
			'paragraph("out"),list_item[paragraph("ta"),paragraph("gamma")]',
		);
	});

	it('blockquote: keeps the tail of the boundary child and later children', () => {
		const state = stateOf(
			[
				para('outside', 'p0'),
				quote('b1', [para('alpha', 'c1'), para('beta', 'c2'), para('gamma', 'c3')]),
			],
			{ id: 'p0', offset: 3 },
			{ id: 'c2', offset: 2 },
		);
		expect(renderDoc(applyDelete(state).doc)).toBe(
			'paragraph("out"),blockquote[paragraph("ta"),paragraph("gamma")]',
		);
	});
});

// --- from-endpoint inside a container: keep the head + untouched earlier children ---

describe('deleteCrossRootRange — from-endpoint inside a container', () => {
	it('list_item: keeps earlier children and the head of the boundary child', () => {
		const state = stateOf(
			[
				item('i1', [para('alpha', 'c1'), para('beta', 'c2'), para('gamma', 'c3')]),
				para('outside', 'p9'),
			],
			{ id: 'c2', offset: 2 },
			{ id: 'p9', offset: 3 },
		);
		expect(renderDoc(applyDelete(state).doc)).toBe(
			'list_item[paragraph("alpha"),paragraph("be")],paragraph("side")',
		);
	});

	it('blockquote: keeps earlier children and the head of the boundary child', () => {
		const state = stateOf(
			[
				quote('b1', [para('alpha', 'c1'), para('beta', 'c2'), para('gamma', 'c3')]),
				para('outside', 'p9'),
			],
			{ id: 'c2', offset: 2 },
			{ id: 'p9', offset: 3 },
		);
		expect(renderDoc(applyDelete(state).doc)).toBe(
			'blockquote[paragraph("alpha"),paragraph("be")],paragraph("side")',
		);
	});

	it('leaves the caret at the from position inside the trimmed container', () => {
		const state = stateOf(
			[
				item('i1', [para('alpha', 'c1'), para('beta', 'c2'), para('gamma', 'c3')]),
				para('outside', 'p9'),
			],
			{ id: 'c2', offset: 2 },
			{ id: 'p9', offset: 3 },
		);
		const tr = deleteSelectionCommand(state);
		if (!tr) throw new Error('expected a transaction');
		const sel = tr.selectionAfter;
		expect(sel && isTextSelection(sel) && isCollapsed(sel)).toBe(true);
		if (sel && isTextSelection(sel)) {
			expect(sel.anchor.blockId).toBe(blockId('c2'));
			expect(sel.anchor.offset).toBe(2);
		}
	});
});

// --- both endpoints inside containers ---

describe('deleteCrossRootRange — both endpoints inside containers', () => {
	it('trims both the from-container tail and the to-container head', () => {
		const state = stateOf(
			[
				item('i1', [para('alpha', 'a1'), para('beta', 'a2'), para('gamma', 'a3')]),
				quote('b1', [para('delta', 'b2'), para('epsilon', 'b3'), para('zeta', 'b4')]),
			],
			{ id: 'a2', offset: 1 },
			{ id: 'b3', offset: 1 },
		);
		expect(renderDoc(applyDelete(state).doc)).toBe(
			'list_item[paragraph("alpha"),paragraph("b")],blockquote[paragraph("psilon"),paragraph("zeta")]',
		);
	});
});

// --- container edges: a boundary at the very start/end covers the whole container ---

describe('deleteCrossRootRange — boundary at a container edge (wholesale)', () => {
	it('removes the whole container when the from-boundary is at its very start', () => {
		const state = stateOf(
			[item('i1', [para('alpha', 'c1'), para('beta', 'c2')]), para('World', 'p9')],
			{ id: 'c1', offset: 0 },
			{ id: 'p9', offset: 2 },
		);
		// Whole list item covered from its start → removed; the caret lands in "rld".
		expect(renderDoc(applyDelete(state).doc)).toBe('paragraph("rld")');
	});

	it('removes the whole container when the to-boundary is at its very end', () => {
		const state = stateOf(
			[para('Hello', 'p0'), item('i1', [para('alpha', 'c1'), para('beta', 'c2')])],
			{ id: 'p0', offset: 2 },
			{ id: 'c2', offset: 'beta'.length },
		);
		expect(renderDoc(applyDelete(state).doc)).toBe('paragraph("He")');
	});
});

// --- depth-2 nesting: the trim recursion must reach the boundary leaf ---

describe('deleteCrossRootRange — depth-2 nesting', () => {
	it('blockquote > list_item > paragraph', () => {
		const state = stateOf(
			[para('out', 'p0'), quote('b1', [item('i1', [para('a1', 'x1'), para('a2', 'x2')])])],
			{ id: 'p0', offset: 2 },
			{ id: 'x1', offset: 1 },
		);
		expect(renderDoc(applyDelete(state).doc)).toBe(
			'paragraph("ou"),blockquote[list_item[paragraph("1"),paragraph("a2")]]',
		);
	});

	it('list_item > blockquote > paragraph', () => {
		const state = stateOf(
			[para('out', 'p0'), item('i1', [quote('b1', [para('a1', 'x1'), para('a2', 'x2')])])],
			{ id: 'p0', offset: 2 },
			{ id: 'x1', offset: 1 },
		);
		expect(renderDoc(applyDelete(state).doc)).toBe(
			'paragraph("ou"),list_item[blockquote[paragraph("1"),paragraph("a2")]]',
		);
	});
});

// --- structured containers (tables) are never trimmed into a ragged shape ---

describe('deleteCrossRootRange — structured containers stay valid', () => {
	it('removes a partially-selected table wholesale instead of leaving ragged rows', () => {
		const table = grid('t1', [
			trow('r0', [cell('A1', 'c00'), cell('B1', 'c01')]),
			trow('r1', [cell('A2', 'c10'), cell('B2', 'c11')]),
		]);
		// Boundary lands in an interior cell (not the table's last leaf at full length).
		const state = stateOf(
			[para('outside', 'p0'), table],
			{ id: 'p0', offset: 3 },
			{ id: 'c01p', offset: 1 },
		);
		const result = applyDelete(state).doc;
		assertNoRaggedTable(result);
		expect(renderDoc(result)).toBe('paragraph("out")');
	});

	it('removes a partially-selected from-table wholesale (reverse direction)', () => {
		const table = grid('t1', [
			trow('r0', [cell('A1', 'c00'), cell('B1', 'c01')]),
			trow('r1', [cell('A2', 'c10'), cell('B2', 'c11')]),
		]);
		const state = stateOf(
			[table, para('outside', 'p9')],
			{ id: 'c01p', offset: 1 },
			{ id: 'p9', offset: 3 },
		);
		const result = applyDelete(state).doc;
		assertNoRaggedTable(result);
		// From-table removed wholesale; "side" survives and hosts the caret.
		expect(renderDoc(result)).toBe('paragraph("side")');
	});
});

// --- undo restores the exact original document ---

describe('deleteCrossRootRange — undo round-trip', () => {
	it('inverting the delete restores the original document deeply', () => {
		const blocks = [
			para('outside', 'p0'),
			item('i1', [para('alpha', 'c1'), para('beta', 'c2'), para('gamma', 'c3')]),
		];
		const state = stateOf(blocks, { id: 'p0', offset: 3 }, { id: 'c2', offset: 2 });
		const original: Document = state.doc;
		const tr = deleteSelectionCommand(state);
		if (!tr) throw new Error('expected a transaction');
		const deleted = state.apply(tr);
		const restored = deleted.apply(invertTransaction(tr));
		expect(restored.doc).toEqual(original);
	});

	it('restores both trimmed containers when the delete spans two composites', () => {
		const blocks = [
			item('i1', [para('alpha', 'a1'), para('beta', 'a2'), para('gamma', 'a3')]),
			quote('b1', [para('delta', 'b2'), para('epsilon', 'b3'), para('zeta', 'b4')]),
		];
		const state = stateOf(blocks, { id: 'a2', offset: 1 }, { id: 'b3', offset: 1 });
		const original: Document = state.doc;
		const tr = deleteSelectionCommand(state);
		if (!tr) throw new Error('expected a transaction');
		const deleted = state.apply(tr);
		const restored = deleted.apply(invertTransaction(tr));
		expect(restored.doc).toEqual(original);
	});
});

// --- void endpoints: a void block is removed, never merged into (#224) ---

describe('range deletion with void endpoints (#224)', () => {
	const VOID_SCHEMA: Schema = {
		nodeTypes: [...SCHEMA.nodeTypes, 'horizontal_rule'],
		markTypes: [],
		getNodeSpec: (type: string) => {
			if (type !== 'horizontal_rule') return undefined;
			return {
				type,
				isVoid: true,
				toDOM: () => document.createElement('hr'),
			} as ReturnType<NonNullable<Schema['getNodeSpec']>>;
		},
	};
	const rule = (id: string): BlockNode => createBlockNode('horizontal_rule', [], blockId(id));

	function voidStateOf(
		blocks: readonly BlockNode[],
		from: { id: string; offset: number },
		to: { id: string; offset: number },
	): EditorState {
		return EditorState.create({
			doc: createDocument([...blocks]),
			selection: createSelection(
				{ blockId: blockId(from.id), offset: from.offset },
				{ blockId: blockId(to.id), offset: to.offset },
			),
			schema: VOID_SCHEMA,
		});
	}

	function caretOf(state: EditorState): { id: string; offset: number } {
		if (!isTextSelection(state.selection) || !isCollapsed(state.selection)) {
			throw new Error('expected a collapsed text selection');
		}
		return { id: state.selection.anchor.blockId, offset: state.selection.anchor.offset };
	}

	it('removes leading, middle and trailing void siblings before merging text (#225)', () => {
		const state = voidStateOf(
			[
				quote('q', [
					rule('v1'),
					para('abc', 'p1'),
					rule('v2'),
					para('def', 'p2'),
					rule('v3'),
					para('keep', 'tail'),
				]),
			],
			{ id: 'v1', offset: 0 },
			{ id: 'v3', offset: 0 },
		);
		const tr = deleteSelectionCommand(state);
		if (!tr) throw new Error('Expected deletion');
		const deleted = expectHistoryRoundTrip(state, tr);
		expect(deleted.doc).toEqual(
			createDocument([quote('q', [para('', 'p1'), para('keep', 'tail')])]),
		);
		expect(caretOf(deleted)).toEqual({ id: 'p1', offset: 0 });
	});

	it('keeps a replacement paragraph in a cell whose selected children are all void (#225)', () => {
		const state = voidStateOf(
			[
				grid('t', [
					trow('r', [
						cell('abc', 'a'),
						createBlockNode('table_cell', [rule('v1'), rule('v2')], blockId('b')),
						cell('def', 'c'),
					]),
				]),
			],
			{ id: 'ap', offset: 1 },
			{ id: 'cp', offset: 1 },
		);
		const tr = deleteSelectionCommand(state);
		if (!tr) throw new Error('Expected deletion');
		const deleted = expectHistoryRoundTrip(state, tr);
		expect(renderDoc(deleted.doc)).toBe(
			'table[table_row[table_cell[paragraph("a")],table_cell[paragraph("")],table_cell[paragraph("ef")]]]',
		);
		expect(caretOf(deleted)).toEqual({ id: 'ap', offset: 1 });
	});

	it('does not merge across a nested container after its void leaf was removed (#225)', () => {
		const state = voidStateOf(
			[quote('q', [para('abc', 'p1'), quote('nested', [rule('v')]), para('def', 'p2')])],
			{ id: 'p1', offset: 1 },
			{ id: 'p2', offset: 1 },
		);
		const tr = deleteSelectionCommand(state);
		if (!tr) throw new Error('Expected deletion');
		const deleted = expectHistoryRoundTrip(state, tr);
		expect(renderDoc(deleted.doc)).toBe(
			'blockquote[paragraph("a"),blockquote[paragraph("")],paragraph("ef")]',
		);
	});

	it('keeps the first text leaf as cursor target after leading void cells (#225)', () => {
		const state = voidStateOf(
			[
				grid('t', [
					trow('r', [createBlockNode('table_cell', [rule('v')], blockId('a')), cell('def', 'b')]),
				]),
			],
			{ id: 'v', offset: 0 },
			{ id: 'bp', offset: 1 },
		);
		const tr = insertTextCommand(state, 'X');
		const deleted = expectHistoryRoundTrip(state, tr);
		expect(renderDoc(deleted.doc)).toBe(
			'table[table_row[table_cell[paragraph("")],table_cell[paragraph("Xef")]]]',
		);
		expect(caretOf(deleted)).toEqual({ id: 'bp', offset: 1 });
	});

	it('round-trips void-only ranges spanning multiple cells (#225)', () => {
		const state = voidStateOf(
			[
				grid('t', [
					trow('r', [
						createBlockNode('table_cell', [rule('v1')], blockId('a')),
						createBlockNode('table_cell', [rule('v2')], blockId('b')),
						cell('keep', 'c'),
					]),
				]),
			],
			{ id: 'v1', offset: 0 },
			{ id: 'v2', offset: 0 },
		);
		const tr = deleteSelectionCommand(state);
		if (!tr) throw new Error('Expected deletion');
		const deleted = expectHistoryRoundTrip(state, tr);
		expect(renderDoc(deleted.doc)).toBe(
			'table[table_row[table_cell[paragraph("")],table_cell[paragraph("")],table_cell[paragraph("keep")]]]',
		);
		expect(caretOf(deleted)).toEqual({ id: deleted.getBlockOrder()[0], offset: 0 });
	});

	it('removes a from-endpoint void root and lands the caret in the trimmed paragraph (#224)', () => {
		const state = voidStateOf(
			[rule('hr1'), para('hello', 'p1'), para('after', 'p2')],
			{ id: 'hr1', offset: 0 },
			{ id: 'p1', offset: 3 },
		);
		const result = applyDelete(state);
		expect(renderDoc(result.doc)).toBe('paragraph("lo"),paragraph("after")');
		expect(caretOf(result)).toEqual({ id: 'p1', offset: 0 });
	});

	it('removes to-endpoint and middle void roots without merging them (#224)', () => {
		const state = voidStateOf(
			[para('hello', 'p0'), rule('hr1'), rule('hr2'), para('after', 'p9')],
			{ id: 'p0', offset: 2 },
			{ id: 'hr2', offset: 0 },
		);
		const result = applyDelete(state);
		expect(renderDoc(result.doc)).toBe('paragraph("he"),paragraph("after")');
		expect(caretOf(result)).toEqual({ id: 'p0', offset: 2 });
	});

	it('replaces a range of only void roots with an empty landing paragraph (#224)', () => {
		const state = voidStateOf(
			[rule('hr1'), rule('hr2'), para('tail', 'p9')],
			{ id: 'hr1', offset: 0 },
			{ id: 'hr2', offset: 0 },
		);
		const result = applyDelete(state);
		expect(renderDoc(result.doc)).toBe('paragraph(""),paragraph("tail")');
		expect(caretOf(result).offset).toBe(0);
		expect(caretOf(result).id).toBe(result.doc.children[0]?.id);
	});

	it('same root: removes a leading void block inside a cell and keeps the paragraph tail (#224)', () => {
		const table = grid('t1', [
			trow('r0', [
				createBlockNode('table_cell', [rule('img1'), para('hello', 'cp')], blockId('c0')),
			]),
		]);
		const state = voidStateOf([table], { id: 'img1', offset: 0 }, { id: 'cp', offset: 3 });
		const result = applyDelete(state);
		assertNoRaggedTable(result.doc);
		expect(renderDoc(result.doc)).toBe('table[table_row[table_cell[paragraph("lo")]]]');
		expect(caretOf(result)).toEqual({ id: 'cp', offset: 0 });
	});

	it('inverting a delete with void endpoints restores the original document (#224)', () => {
		const state = voidStateOf(
			[rule('hr1'), para('hello', 'p1'), rule('hr2'), para('after', 'p2')],
			{ id: 'hr1', offset: 0 },
			{ id: 'hr2', offset: 0 },
		);
		const original: Document = state.doc;
		const tr = deleteSelectionCommand(state);
		if (!tr) throw new Error('expected a transaction');
		const restored = state.apply(tr).apply(invertTransaction(tr));
		expect(restored.doc).toEqual(original);
	});
});
