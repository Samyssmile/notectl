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
	createTextNode,
	getBlockChildren,
	isLeafBlock,
	isTextNode,
} from '../model/Document.js';
import { createSelection, isCollapsed, isTextSelection } from '../model/Selection.js';
import { type BlockId, blockId } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import { invertTransaction } from '../state/StepHandlers.js';
import { deleteSelectionCommand } from './Commands.js';

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
		// Whole list item covered from its start → removed; landing paragraph + "rld".
		expect(renderDoc(applyDelete(state).doc)).toBe('paragraph(""),paragraph("rld")');
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
		// From-table removed wholesale with a landing paragraph; "side" survives.
		expect(renderDoc(result)).toBe('paragraph(""),paragraph("side")');
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
