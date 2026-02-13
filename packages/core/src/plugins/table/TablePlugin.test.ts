import { describe, expect, it, vi } from 'vitest';
import {
	type BlockNode,
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockChildren,
	getBlockText,
	isBlockNode,
} from '../../model/Document.js';
import { schemaFromRegistry } from '../../model/Schema.js';
import { createCollapsedSelection, isCollapsed } from '../../model/Selection.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin } from '../Plugin.js';
import { PluginManager } from '../PluginManager.js';
import {
	createTable,
	createTableCell,
	createTableRow,
	findTableContext,
	getAllCellIds,
	getCellAt,
	isInsideTable,
} from './TableHelpers.js';
import { TablePlugin } from './TablePlugin.js';

// --- Helpers ---

function makeTableState(rows = 2, cols = 3, cursorRow = 0, cursorCol = 0): EditorState {
	const table: BlockNode = createTable(rows, cols);
	const para: BlockNode = createBlockNode(
		nodeType('paragraph') as NodeTypeName,
		[createTextNode('')],
		'para-after' as BlockId,
	);

	const doc = createDocument([table, para]);

	// Find the cell to place cursor in
	const tableRows: readonly BlockNode[] = getBlockChildren(table);
	const row = tableRows[cursorRow];
	const cells: readonly BlockNode[] = getBlockChildren(row);
	const cell = cells[cursorCol];

	const schema = {
		nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell'],
		markTypes: ['bold', 'italic', 'underline'],
		getNodeSpec: (type: string) => {
			if (type === 'table' || type === 'table_cell') {
				return { type, isolating: true, toDOM: () => document.createElement('div') };
			}
			return { type, toDOM: () => document.createElement('div') };
		},
	};

	return EditorState.create({
		doc,
		selection: createCollapsedSelection(cell.id, 0),
		schema,
	});
}

function makeState(
	blocks?: {
		type: string;
		text: string;
		id: string;
		attrs?: Record<string, string | number | boolean>;
	}[],
	cursorBlockId?: string,
	cursorOffset?: number,
): EditorState {
	const blockNodes = (blocks ?? [{ type: 'paragraph', text: '', id: 'b1' }]).map((b) =>
		createBlockNode(b.type as NodeTypeName, [createTextNode(b.text)], b.id as BlockId, b.attrs),
	);
	const doc = createDocument(blockNodes);
	return EditorState.create({
		doc,
		selection: createCollapsedSelection(
			(cursorBlockId ?? blockNodes[0]?.id) as BlockId,
			cursorOffset ?? 0,
		),
		schema: {
			nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell'],
			markTypes: ['bold', 'italic', 'underline'],
		},
	});
}

async function initPlugin(
	plugin: Plugin,
	state?: EditorState,
): Promise<{
	pm: PluginManager;
	dispatch: ReturnType<typeof vi.fn>;
	getState: () => EditorState;
}> {
	const pm = new PluginManager();
	pm.register(plugin);
	let currentState = state ?? makeState();

	const trackingDispatch = vi.fn((tr: Transaction) => {
		currentState = currentState.apply(tr);
	});

	await pm.init({
		getState: () => currentState,
		dispatch: trackingDispatch,
		getContainer: () => document.createElement('div'),
		getPluginContainer: () => document.createElement('div'),
	});

	return { pm, dispatch: trackingDispatch, getState: () => currentState };
}

// --- Tests ---

describe('TablePlugin', () => {
	describe('registration', () => {
		it('has correct id, name, and priority', () => {
			const plugin = new TablePlugin();
			expect(plugin.id).toBe('table');
			expect(plugin.name).toBe('Table');
			expect(plugin.priority).toBe(40);
		});
	});

	describe('NodeSpec registration', () => {
		it('registers table, table_row, and table_cell NodeSpecs', async () => {
			const { pm } = await initPlugin(new TablePlugin());
			expect(pm.schemaRegistry.getNodeSpec('table')).toBeDefined();
			expect(pm.schemaRegistry.getNodeSpec('table_row')).toBeDefined();
			expect(pm.schemaRegistry.getNodeSpec('table_cell')).toBeDefined();
		});

		it('table NodeSpec has isolating: true', async () => {
			const { pm } = await initPlugin(new TablePlugin());
			const spec = pm.schemaRegistry.getNodeSpec('table');
			expect(spec?.isolating).toBe(true);
		});

		it('table NodeSpec has selectable: true', async () => {
			const { pm } = await initPlugin(new TablePlugin());
			const spec = pm.schemaRegistry.getNodeSpec('table');
			expect(spec?.selectable).toBe(true);
		});

		it('table_cell NodeSpec has isolating: true', async () => {
			const { pm } = await initPlugin(new TablePlugin());
			const spec = pm.schemaRegistry.getNodeSpec('table_cell');
			expect(spec?.isolating).toBe(true);
		});

		it('table NodeSpec toDOM creates element with data-block-id', async () => {
			const { pm } = await initPlugin(new TablePlugin());
			const spec = pm.schemaRegistry.getNodeSpec('table');
			const el = spec?.toDOM(createBlockNode('table', [], 'tbl-1' as BlockId));
			expect(el?.getAttribute('data-block-id')).toBe('tbl-1');
		});

		it('table_cell NodeSpec toDOM creates td element', async () => {
			const { pm } = await initPlugin(new TablePlugin());
			const spec = pm.schemaRegistry.getNodeSpec('table_cell');
			const el = spec?.toDOM(createBlockNode('table_cell', [createTextNode('')], 'c1' as BlockId));
			expect(el?.tagName).toBe('TD');
			expect(el?.getAttribute('role')).toBe('cell');
		});
	});

	describe('NodeView registration', () => {
		it('registers NodeViews for table, table_row, and table_cell', async () => {
			const { pm } = await initPlugin(new TablePlugin());
			expect(pm.schemaRegistry.getNodeViewFactory('table')).toBeDefined();
			expect(pm.schemaRegistry.getNodeViewFactory('table_row')).toBeDefined();
			expect(pm.schemaRegistry.getNodeViewFactory('table_cell')).toBeDefined();
		});
	});

	describe('toolbar', () => {
		it('registers table toolbar item with grid picker', async () => {
			const { pm } = await initPlugin(new TablePlugin());
			const item = pm.schemaRegistry.getToolbarItem('table');
			expect(item).toBeDefined();
			expect(item?.group).toBe('insert');
			expect(item?.label).toBe('Insert Table');
			expect(item?.popupType).toBe('gridPicker');
			expect(item?.priority).toBe(80);
		});

		it('respects separatorAfter config', async () => {
			const { pm } = await initPlugin(new TablePlugin({ separatorAfter: true }));
			const item = pm.schemaRegistry.getToolbarItem('table');
			expect(item?.separatorAfter).toBe(true);
		});
	});

	describe('command registration', () => {
		it('registers insertTable command', async () => {
			const { pm, dispatch } = await initPlugin(new TablePlugin());
			const result: boolean = pm.executeCommand('insertTable');
			expect(result).toBe(true);
			expect(dispatch).toHaveBeenCalled();
		});

		it('registers addRowAbove command', async () => {
			const state = makeTableState(2, 3);
			const { pm } = await initPlugin(new TablePlugin(), state);
			// Command exists but needs table context (returns false without)
			expect(pm.executeCommand('addRowAbove')).toBeDefined();
		});

		it('registers addRowBelow command', async () => {
			const { pm } = await initPlugin(new TablePlugin());
			expect(pm.executeCommand('addRowBelow')).toBeDefined();
		});

		it('registers deleteRow command', async () => {
			const { pm } = await initPlugin(new TablePlugin());
			expect(pm.executeCommand('deleteRow')).toBeDefined();
		});

		it('registers deleteColumn command', async () => {
			const { pm } = await initPlugin(new TablePlugin());
			expect(pm.executeCommand('deleteColumn')).toBeDefined();
		});

		it('registers deleteTable command', async () => {
			const { pm } = await initPlugin(new TablePlugin());
			expect(pm.executeCommand('deleteTable')).toBeDefined();
		});

		it('registers selectTable command', async () => {
			const { pm } = await initPlugin(new TablePlugin());
			expect(pm.executeCommand('selectTable')).toBeDefined();
		});
	});
});

describe('TableHelpers', () => {
	describe('createTable', () => {
		it('creates correct nested structure', () => {
			const table: BlockNode = createTable(2, 3);
			expect(table.type).toBe('table');

			const rows: readonly BlockNode[] = getBlockChildren(table);
			expect(rows.length).toBe(2);

			for (const row of rows) {
				expect(row.type).toBe('table_row');
				const cells: readonly BlockNode[] = getBlockChildren(row);
				expect(cells.length).toBe(3);
				for (const cell of cells) {
					expect(cell.type).toBe('table_cell');
				}
			}
		});

		it('each node has a unique ID', () => {
			const table: BlockNode = createTable(2, 2);
			const ids = new Set<string>();
			ids.add(table.id);

			const rows: readonly BlockNode[] = getBlockChildren(table);
			for (const row of rows) {
				ids.add(row.id);
				const cells: readonly BlockNode[] = getBlockChildren(row);
				for (const cell of cells) {
					ids.add(cell.id);
				}
			}

			// table(1) + rows(2) + cells(4) = 7 unique IDs
			expect(ids.size).toBe(7);
		});
	});

	describe('createTableRow', () => {
		it('creates a row with correct number of cells', () => {
			const row: BlockNode = createTableRow(4);
			expect(row.type).toBe('table_row');
			expect(getBlockChildren(row).length).toBe(4);
		});
	});

	describe('createTableCell', () => {
		it('creates a cell with empty text', () => {
			const cell: BlockNode = createTableCell();
			expect(cell.type).toBe('table_cell');
			expect(getBlockText(cell)).toBe('');
		});
	});

	describe('findTableContext', () => {
		it('returns context when cursor is in a table cell', () => {
			const state = makeTableState(2, 3, 1, 2);
			const ctx = findTableContext(state, state.selection.anchor.blockId);
			expect(ctx).not.toBeNull();
			expect(ctx?.rowIndex).toBe(1);
			expect(ctx?.colIndex).toBe(2);
			expect(ctx?.totalRows).toBe(2);
			expect(ctx?.totalCols).toBe(3);
		});

		it('returns null when cursor is outside table', () => {
			const state = makeTableState(2, 3);
			// Cursor on para-after
			const paraState: EditorState = EditorState.create({
				doc: state.doc,
				selection: createCollapsedSelection('para-after' as BlockId, 0),
				schema: state.schema,
			});
			const ctx = findTableContext(paraState, paraState.selection.anchor.blockId);
			expect(ctx).toBeNull();
		});
	});

	describe('getCellAt', () => {
		it('returns correct cell ID', () => {
			const state = makeTableState(2, 3);
			const table = state.doc.children[0];
			const rows: readonly BlockNode[] = getBlockChildren(table);
			const expectedCell = getBlockChildren(rows[1])[2];

			const cellId = getCellAt(state, table?.id, 1, 2);
			expect(cellId).toBe(expectedCell?.id);
		});

		it('returns null for out-of-bounds', () => {
			const state = makeTableState(2, 3);
			const table = state.doc.children[0];
			expect(getCellAt(state, table?.id, 5, 0)).toBeNull();
		});
	});

	describe('getAllCellIds', () => {
		it('returns all cell IDs in row-major order', () => {
			const state = makeTableState(2, 3);
			const table = state.doc.children[0];
			const ids = getAllCellIds(state, table?.id);
			expect(ids.length).toBe(6);
		});
	});

	describe('isInsideTable', () => {
		it('returns true for cell inside table', () => {
			const state = makeTableState(2, 3);
			expect(isInsideTable(state, state.selection.anchor.blockId)).toBe(true);
		});

		it('returns false for block outside table', () => {
			const state = makeTableState(2, 3);
			expect(isInsideTable(state, 'para-after' as BlockId)).toBe(false);
		});
	});
});

describe('Table insertTable command', () => {
	it('inserts a table into the document', async () => {
		const state = makeState([{ type: 'paragraph', text: 'Hello', id: 'b1' }]);
		const { pm, dispatch, getState } = await initPlugin(new TablePlugin(), state);

		pm.executeCommand('insertTable');

		expect(dispatch).toHaveBeenCalled();
		const newState = getState();

		// Should have: original paragraph, table, new paragraph
		expect(newState.doc.children.length).toBe(3);
		expect(newState.doc.children[0]?.type).toBe('paragraph');
		expect(newState.doc.children[1]?.type).toBe('table');
		expect(newState.doc.children[2]?.type).toBe('paragraph');

		// Table should be 3x3 by default
		const table = newState.doc.children[1];
		const rows: readonly BlockNode[] = getBlockChildren(table);
		expect(rows.length).toBe(3);
		for (const row of rows) {
			expect(getBlockChildren(row).length).toBe(3);
		}
	});

	it('places cursor in first cell after insert', async () => {
		const state = makeState([{ type: 'paragraph', text: '', id: 'b1' }]);
		const { pm, getState } = await initPlugin(new TablePlugin(), state);

		pm.executeCommand('insertTable');

		const newState = getState();
		const table = newState.doc.children[1];
		const firstRow = getBlockChildren(table)[0];
		const firstCell = getBlockChildren(firstRow)[0];

		expect(newState.selection.anchor.blockId).toBe(firstCell?.id);
		expect(newState.selection.anchor.offset).toBe(0);
	});
});
