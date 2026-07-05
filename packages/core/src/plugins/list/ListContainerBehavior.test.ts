import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockChildren,
	getBlockText,
	isLeafBlock,
} from '../../model/Document.js';
import { createCollapsedSelection, isTextSelection } from '../../model/Selection.js';
import { blockId } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import { pluginHarness } from '../../test/TestUtils.js';
import { ListPlugin } from './ListPlugin.js';

/**
 * Container list items (#194): keyboard and command behavior when the caret
 * sits inside a block child of a `list_item`, mirroring the blockquote
 * container conventions (Enter exits on an empty trailing child, Backspace at
 * the start of the first child lifts the content out, commands resolve the
 * owning item through the ancestor chain).
 */

// --- Helpers ---

function para(text: string, id: string): BlockNode {
	return createBlockNode('paragraph', [createTextNode(text)], blockId(id));
}

function containerItem(
	id: string,
	children: readonly BlockNode[],
	attrs?: Partial<{ listType: string; indent: number; checked: boolean }>,
): BlockNode {
	return createBlockNode('list_item', children, blockId(id), {
		listType: 'bullet',
		indent: 0,
		checked: false,
		...attrs,
	});
}

function stateWith(blocks: readonly BlockNode[], cursorId: string, offset = 0): EditorState {
	return EditorState.create({
		doc: createDocument([...blocks]),
		selection: createCollapsedSelection(blockId(cursorId), offset),
	});
}

async function harness(state: EditorState) {
	return pluginHarness(new ListPlugin(), state, { builtinSpecs: true });
}

type Harness = Awaited<ReturnType<typeof harness>>;

function keymapHandler(h: Harness, descriptor: string): (() => boolean) | undefined {
	for (const km of h.getKeymaps()) {
		const handler = km[descriptor];
		if (handler) return handler;
	}
	return undefined;
}

// --- Enter ---

describe('container list items — Enter (#194)', () => {
	it('is not handled inside a non-empty child paragraph (default split applies)', async () => {
		const item = containerItem('i1', [para('first', 'c1'), para('second', 'c2')]);
		const h = await harness(stateWith([item], 'c1', 2));

		expect(keymapHandler(h, 'Enter')?.()).toBe(false);
	});

	it('exits an empty trailing child into a new sibling list item', async () => {
		const item = containerItem('i1', [para('first', 'c1'), para('', 'c2')], { indent: 1 });
		const h = await harness(stateWith([item], 'c2', 0));

		expect(keymapHandler(h, 'Enter')?.()).toBe(true);

		const doc = h.getState().doc;
		expect(doc.children).toHaveLength(2);
		const remaining = doc.children[0];
		const fresh = doc.children[1];
		if (!remaining || !fresh) return;
		expect(getBlockChildren(remaining).map((c) => c.id)).toEqual(['c1']);
		expect(fresh.type).toBe('list_item');
		expect(isLeafBlock(fresh)).toBe(true);
		expect(getBlockText(fresh)).toBe('');
		expect(fresh.attrs?.listType).toBe('bullet');
		expect(fresh.attrs?.indent).toBe(1);

		const sel = h.getState().selection;
		expect(isTextSelection(sel) && sel.anchor.blockId === fresh.id).toBe(true);
	});

	it('dissolves the item when its only child is empty', async () => {
		const item = containerItem('i1', [para('', 'c1')]);
		const h = await harness(stateWith([item], 'c1', 0));

		expect(keymapHandler(h, 'Enter')?.()).toBe(true);

		const doc = h.getState().doc;
		expect(doc.children).toHaveLength(1);
		expect(doc.children[0]?.type).toBe('paragraph');
		expect(doc.children[0]?.id).toBe('c1');
	});
});

// --- Backspace ---

describe('container list items — Backspace (#194)', () => {
	it('dissolves the item into its children at the start of the first child', async () => {
		const item = containerItem('i1', [para('first', 'c1'), para('second', 'c2')]);
		const h = await harness(stateWith([item], 'c1', 0));

		expect(keymapHandler(h, 'Backspace')?.()).toBe(true);

		const doc = h.getState().doc;
		expect(doc.children.map((b) => b.id)).toEqual(['c1', 'c2']);
		expect(doc.children.map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
	});

	it('is not handled at the start of a later child (default merge applies)', async () => {
		const item = containerItem('i1', [para('first', 'c1'), para('second', 'c2')]);
		const h = await harness(stateWith([item], 'c2', 0));

		expect(keymapHandler(h, 'Backspace')?.()).toBe(false);
	});

	it('is not handled mid-text inside a child', async () => {
		const item = containerItem('i1', [para('first', 'c1'), para('second', 'c2')]);
		const h = await harness(stateWith([item], 'c1', 3));

		expect(keymapHandler(h, 'Backspace')?.()).toBe(false);
	});
});

// --- Commands resolve the owning item ---

describe('container list items — commands resolve the ancestor item (#194)', () => {
	it('indents the owning item when the caret is inside a child paragraph', async () => {
		const item = containerItem('i1', [para('first', 'c1'), para('second', 'c2')]);
		const h = await harness(stateWith([item], 'c2', 0));

		expect(h.executeCommand('indentListItem')).toBe(true);

		const updated = h.getState().getBlock(blockId('i1'));
		expect(updated?.attrs?.indent).toBe(1);
		expect(getBlockChildren(updated as BlockNode)).toHaveLength(2);
	});

	it('toggles the checked state of a checklist container from a child paragraph', async () => {
		const item = containerItem('i1', [para('done', 'c1'), para('details', 'c2')], {
			listType: 'checklist',
		});
		const h = await harness(stateWith([item], 'c2', 0));

		expect(h.executeCommand('toggleChecklistItem')).toBe(true);

		expect(h.getState().getBlock(blockId('i1'))?.attrs?.checked).toBe(true);
	});

	it('toggleList of the same type dissolves a container item from within', async () => {
		const item = containerItem('i1', [para('first', 'c1'), para('second', 'c2')]);
		const h = await harness(stateWith([item], 'c1', 0));

		expect(h.executeCommand('toggleList:bullet')).toBe(true);

		const doc = h.getState().doc;
		expect(doc.children.map((b) => b.id)).toEqual(['c1', 'c2']);
		expect(doc.children.every((b) => b.type === 'paragraph')).toBe(true);
	});

	it('marks the toolbar item active when the caret is inside a container child', async () => {
		const item = containerItem('i1', [para('first', 'c1'), para('second', 'c2')]);
		const h = await harness(stateWith([item], 'c1', 0));

		const toolbarItem = h.getToolbarItem('list-bullet');
		expect(toolbarItem?.isActive?.(h.getState())).toBe(true);
	});
});

// --- Input rules ---

describe('container list items — input rules (#194)', () => {
	it('does not convert a child paragraph of a list item into a nested item', async () => {
		const item = containerItem('i1', [para('- x', 'c1'), para('second', 'c2')]);
		const h = await harness(stateWith([item], 'c1', 2));

		const rule = h.getInputRules().find((r) => r.pattern.test('- '));
		expect(rule).toBeDefined();
		const match = '- '.match(rule?.pattern ?? /^$/);
		expect(match).not.toBeNull();
		if (!match) return;

		expect(rule?.handler(h.getState(), match, 0, 2)).toBeNull();
	});
});
