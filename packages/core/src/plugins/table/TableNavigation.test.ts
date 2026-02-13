import { describe, expect, it } from 'vitest';
import { type BlockNode, createBlockNode, createDocument, createTextNode, getBlockChildren } from '../../model/Document.js';
import type { Keymap } from '../../input/Keymap.js';
import { createCollapsedSelection, isNodeSelection } from '../../model/Selection.js';
import type { NodeTypeName } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { createTable } from './TableHelpers.js';
import { registerTableKeymaps } from './TableNavigation.js';

function makeTableState(rows = 2, cols = 2, cursorRow = 0, cursorCol = 0): EditorState {
	const table: BlockNode = createTable(rows, cols);
	const para: BlockNode = createBlockNode(
		nodeType('paragraph') as NodeTypeName,
		[createTextNode('')],
		'para-after',
	);

	const tableRows: readonly BlockNode[] = getBlockChildren(table);
	const row = tableRows[cursorRow];
	if (!row) {
		throw new Error('Invalid row index');
	}

	const cells: readonly BlockNode[] = getBlockChildren(row);
	const cell = cells[cursorCol];
	if (!cell) {
		throw new Error('Invalid column index');
	}

	const doc = createDocument([table, para]);
	return EditorState.create({
		doc,
		selection: createCollapsedSelection(cell.id, 0),
		schema: {
			nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell'],
			markTypes: ['bold', 'italic', 'underline'],
		},
	});
}

function setupTableKeymap(state: EditorState): {
	readonly keymap: Keymap;
	getState: () => EditorState;
} {
	let currentState = state;
	let registeredKeymap: Keymap | null = null;

	const context = {
		getState: () => currentState,
		dispatch: (tr: Transaction) => {
			currentState = currentState.apply(tr);
		},
		registerKeymap: (keymap: Keymap) => {
			registeredKeymap = keymap;
		},
	} as unknown as PluginContext;

	registerTableKeymaps(context);

	if (!registeredKeymap) {
		throw new Error('Table keymap was not registered');
	}

	return {
		keymap: registeredKeymap,
		getState: () => currentState,
	};
}

describe('TableNavigation', () => {
	it('Backspace at first-cell start selects the table node', () => {
		const initialState = makeTableState(2, 2, 0, 0);
		const { keymap, getState } = setupTableKeymap(initialState);

		expect(keymap.Backspace?.()).toBe(true);

		const state = getState();
		expect(isNodeSelection(state.selection)).toBe(true);
		if (isNodeSelection(state.selection)) {
			expect(state.selection.nodeId).toBe(state.doc.children[0]?.id);
		}
	});

	it('Delete at last-cell end selects the table node', () => {
		const initialState = makeTableState(2, 2, 1, 1);
		const { keymap, getState } = setupTableKeymap(initialState);

		expect(keymap.Delete?.()).toBe(true);

		const state = getState();
		expect(isNodeSelection(state.selection)).toBe(true);
		if (isNodeSelection(state.selection)) {
			expect(state.selection.nodeId).toBe(state.doc.children[0]?.id);
		}
	});

	it('Backspace in non-deletion-boundary cell returns false', () => {
		const initialState = makeTableState(2, 2, 0, 1);
		const { keymap, getState } = setupTableKeymap(initialState);

		expect(keymap.Backspace?.()).toBe(false);
		expect(isNodeSelection(getState().selection)).toBe(false);
	});

	it('Delete in non-deletion-boundary cell returns false', () => {
		const initialState = makeTableState(2, 2, 0, 0);
		const { keymap, getState } = setupTableKeymap(initialState);

		expect(keymap.Delete?.()).toBe(false);
		expect(isNodeSelection(getState().selection)).toBe(false);
	});
});
