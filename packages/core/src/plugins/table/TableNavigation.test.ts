import { describe, expect, it } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockChildren,
} from '../../model/Document.js';
import { createCollapsedSelection, isNodeSelection } from '../../model/Selection.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { registerTableKeymaps } from './TableNavigation.js';
import { TABLE_SCHEMA, createTableState } from './TableTestUtils.js';

// --- Test-specific Helpers ---

interface KeymapRegistry {
	[key: string]: () => boolean;
}

function createContextWithKeymaps(initialState: EditorState) {
	let currentState = initialState;
	const keymaps: KeymapRegistry = {};

	const context = {
		getState: () => currentState,
		dispatch: (tr: Transaction) => {
			currentState = currentState.apply(tr);
		},
		registerKeymap: (km: Record<string, () => boolean>) => {
			Object.assign(keymaps, km);
		},
		announce: () => {},
		getContainer: () => document.createElement('div'),
	} as unknown as PluginContext;

	registerTableKeymaps(context);

	return {
		keymaps,
		getState: () => currentState,
		pressKey: (key: string): boolean => {
			const handler = keymaps[key];
			if (!handler) return false;
			return handler();
		},
	};
}

/** Creates table state with cell text like `r0c0`, `r1c2` (length 4). */
function createNavState(
	rows: number,
	cols: number,
	cursorRow: number,
	cursorCol: number,
	cursorOffset = 0,
): EditorState {
	return createTableState({
		rows,
		cols,
		cursorRow,
		cursorCol,
		cursorOffset,
		cellText: (r: number, c: number) => `r${r}c${c}`,
	});
}

// --- Tests ---

describe('TableNavigation', () => {
	describe('Tab', () => {
		it('moves to next cell in same row', () => {
			const state = createNavState(2, 3, 0, 0);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('Tab')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('p0_1');
		});

		it('wraps to first cell of next row', () => {
			const state = createNavState(2, 2, 0, 1);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('Tab')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('p1_0');
		});

		it('adds a new row at end of table', () => {
			const state = createNavState(2, 2, 1, 1);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('Tab')).toBe(true);

			const table = getState().getBlock('t1' as BlockId);
			expect(table).toBeDefined();
			if (!table) return;

			expect(getBlockChildren(table)).toHaveLength(3);
		});

		it('returns false when not inside a table', () => {
			const state = EditorState.create({
				doc: createDocument([
					createBlockNode('paragraph' as NodeTypeName, [createTextNode('hello')], 'p1' as BlockId),
				]),
				selection: createCollapsedSelection('p1' as BlockId, 0),
				schema: TABLE_SCHEMA,
			});
			const { pressKey } = createContextWithKeymaps(state);

			expect(pressKey('Tab')).toBe(false);
		});
	});

	describe('Shift-Tab', () => {
		it('moves to previous cell in same row', () => {
			const state = createNavState(2, 3, 0, 2);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('Shift-Tab')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('p0_1');
		});

		it('wraps to last cell of previous row', () => {
			const state = createNavState(2, 2, 1, 0);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('Shift-Tab')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('p0_1');
		});

		it('stays put at start of table', () => {
			const state = createNavState(2, 2, 0, 0);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('Shift-Tab')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('p0_0');
		});
	});

	describe('Enter', () => {
		it('moves to same column in next row', () => {
			const state = createNavState(3, 2, 0, 1);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('Enter')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('p1_1');
		});

		it('blocks at last row to prevent splitBlock', () => {
			const state = createNavState(2, 2, 1, 0);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('Enter')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('p1_0');
		});

		it('returns false when not inside a table', () => {
			const state = EditorState.create({
				doc: createDocument([
					createBlockNode('paragraph' as NodeTypeName, [createTextNode('hello')], 'p1' as BlockId),
				]),
				selection: createCollapsedSelection('p1' as BlockId, 0),
				schema: TABLE_SCHEMA,
			});
			const { pressKey } = createContextWithKeymaps(state);

			expect(pressKey('Enter')).toBe(false);
		});
	});

	describe('ArrowDown', () => {
		it('moves to same column in next row when on last leaf', () => {
			const state = createNavState(3, 2, 0, 1);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('ArrowDown')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('p1_1');
		});

		it('escapes table at last row', () => {
			const state = createNavState(2, 2, 1, 0);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('ArrowDown')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('after');
		});
	});

	describe('ArrowUp', () => {
		it('moves to same column in previous row when on first leaf', () => {
			const state = createNavState(3, 2, 1, 1);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('ArrowUp')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('p0_1');
		});

		it('returns false at first row', () => {
			const state = createNavState(2, 2, 0, 0);
			const { pressKey } = createContextWithKeymaps(state);

			expect(pressKey('ArrowUp')).toBe(false);
		});
	});

	describe('ArrowRight', () => {
		it('moves to next cell at end of cell content', () => {
			const state = createNavState(2, 2, 0, 0, 4);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('ArrowRight')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('p0_1');
		});

		it('does not intercept when cursor is not at end', () => {
			const state = createNavState(2, 2, 0, 0, 1);
			const { pressKey } = createContextWithKeymaps(state);

			expect(pressKey('ArrowRight')).toBe(false);
		});

		it('wraps to next row at end of last column', () => {
			const state = createNavState(2, 2, 0, 1, 4);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('ArrowRight')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('p1_0');
		});
	});

	describe('ArrowLeft', () => {
		it('moves to previous cell at start of cell content', () => {
			const state = createNavState(2, 2, 0, 1, 0);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('ArrowLeft')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('p0_0');
			expect(getState().selection.anchor.offset).toBe(4);
		});

		it('does not intercept when cursor is not at start', () => {
			const state = createNavState(2, 2, 0, 1, 2);
			const { pressKey } = createContextWithKeymaps(state);

			expect(pressKey('ArrowLeft')).toBe(false);
		});

		it('wraps to previous row at start of first column', () => {
			const state = createNavState(2, 2, 1, 0, 0);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('ArrowLeft')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('p0_1');
		});

		it('stays put at start of table', () => {
			const state = createNavState(2, 2, 0, 0, 0);
			const { pressKey } = createContextWithKeymaps(state);

			expect(pressKey('ArrowLeft')).toBe(true);
		});
	});

	describe('Escape', () => {
		it('moves cursor to paragraph after the table', () => {
			const state = createNavState(2, 2, 0, 0);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('Escape')).toBe(true);
			expect(getState().selection.anchor.blockId).toBe('after');
			expect(getState().selection.anchor.offset).toBe(0);
		});
	});

	describe('Backspace', () => {
		it('selects table node at top-left cell when cursor is at offset 0', () => {
			const state = createNavState(2, 2, 0, 0, 0);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('Backspace')).toBe(true);
			expect(isNodeSelection(getState().selection)).toBe(true);
		});

		it('does not intercept when not at top-left cell', () => {
			const state = createNavState(2, 2, 1, 1, 0);
			const { pressKey } = createContextWithKeymaps(state);

			expect(pressKey('Backspace')).toBe(false);
		});

		it('does not intercept when cursor offset is not 0', () => {
			const state = createNavState(2, 2, 0, 0, 2);
			const { pressKey } = createContextWithKeymaps(state);

			expect(pressKey('Backspace')).toBe(false);
		});
	});

	describe('Delete', () => {
		it('selects table node at bottom-right cell when cursor is at end', () => {
			const state = createNavState(2, 2, 1, 1, 4);
			const { pressKey, getState } = createContextWithKeymaps(state);

			expect(pressKey('Delete')).toBe(true);
			expect(isNodeSelection(getState().selection)).toBe(true);
		});

		it('does not intercept when not at bottom-right cell', () => {
			const state = createNavState(2, 2, 0, 0, 4);
			const { pressKey } = createContextWithKeymaps(state);

			expect(pressKey('Delete')).toBe(false);
		});

		it('does not intercept when cursor is not at end', () => {
			const state = createNavState(2, 2, 1, 1, 0);
			const { pressKey } = createContextWithKeymaps(state);

			expect(pressKey('Delete')).toBe(false);
		});
	});
});
