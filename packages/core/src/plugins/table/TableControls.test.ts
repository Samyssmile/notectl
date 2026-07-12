import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createTextNode, getBlockChildren } from '../../model/Document.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { createTableControls } from './TableControls.js';
import { TableSelectionServiceKey } from './TableSelection.js';
import { type TableSizingService, TableSizingServiceKey } from './TableSizing.js';

// --- Helpers ---

function createTableBlockNode(
	rows: number,
	cols: number,
	tableId = 't1',
): ReturnType<typeof createBlockNode> {
	const rowNodes = [];
	for (let r = 0; r < rows; r++) {
		const cellNodes = [];
		for (let c = 0; c < cols; c++) {
			cellNodes.push(
				createBlockNode(
					'table_cell' as NodeTypeName,
					[
						createBlockNode(
							'paragraph' as NodeTypeName,
							[createTextNode('')],
							`p${r}_${c}` as BlockId,
						),
					],
					`c${r}_${c}` as BlockId,
				),
			);
		}
		rowNodes.push(createBlockNode('table_row' as NodeTypeName, cellNodes, `row${r}` as BlockId));
	}
	return createBlockNode('table' as NodeTypeName, rowNodes, tableId as BlockId);
}

function createMockContainer(): HTMLElement {
	const container: HTMLDivElement = document.createElement('div');
	document.body.appendChild(container);
	return container;
}

function createMockTable(): HTMLTableElement {
	const table: HTMLTableElement = document.createElement('table');
	const tbody: HTMLTableSectionElement = document.createElement('tbody');
	const tr: HTMLTableRowElement = document.createElement('tr');
	const td: HTMLTableCellElement = document.createElement('td');
	tr.appendChild(td);
	tbody.appendChild(tr);
	table.appendChild(tbody);
	return table;
}

function createMeasuredTable(rows = 2, columns = 3): HTMLTableElement {
	const table: HTMLTableElement = document.createElement('table');
	const colgroup: HTMLTableColElement = document.createElement('colgroup');
	for (let column = 0; column < columns; column++) {
		const col: HTMLTableColElement = document.createElement('col');
		col.getBoundingClientRect = () => new DOMRect(column * 100, 0, 100, rows * 40);
		colgroup.appendChild(col);
	}
	const tbody: HTMLTableSectionElement = document.createElement('tbody');
	for (let row = 0; row < rows; row++) {
		const tr: HTMLTableRowElement = document.createElement('tr');
		tr.getBoundingClientRect = () => new DOMRect(0, row * 40, columns * 100, 40);
		for (let column = 0; column < columns; column++) tr.appendChild(document.createElement('td'));
		tbody.appendChild(tr);
	}
	table.append(colgroup, tbody);
	table.getBoundingClientRect = () => new DOMRect(0, 0, columns * 100, rows * 40);
	return table;
}

function pointerEvent(type: string, init: PointerEventInit): PointerEvent {
	return new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', ...init });
}

function stubDeps() {
	const getState = vi.fn() as unknown as () => EditorState;
	const dispatch = vi.fn() as unknown as (tr: Transaction) => void;
	return { getState, dispatch };
}

function stubDepsForNode(node: ReturnType<typeof createBlockNode>) {
	const getState = vi.fn(() => ({ getBlock: () => node }) as unknown as EditorState);
	const dispatch = vi.fn() as unknown as (tr: Transaction) => void;
	return { getState, dispatch };
}

// --- Tests ---

describe('TableControls', () => {
	it('appends control elements to the container', () => {
		const container = createMockContainer();
		const tableEl = createMockTable();
		container.appendChild(tableEl);
		const node = createTableBlockNode(2, 3);
		const { getState, dispatch } = stubDeps();

		createTableControls(container, tableEl, node, getState, dispatch);

		expect(container.querySelector('.ntbl-col-bar')).not.toBeNull();
		expect(container.querySelector('.ntbl-row-bar')).not.toBeNull();
		expect(container.querySelector('.ntbl-insert-line--horizontal')).not.toBeNull();
		expect(container.querySelector('.ntbl-insert-line--vertical')).not.toBeNull();
		expect(container.querySelector('.ntbl-add-row')).not.toBeNull();
		expect(container.querySelector('.ntbl-add-col')).not.toBeNull();
		expect(container.querySelector('.ntbl-delete-table-btn')).not.toBeNull();
	});

	it('builds correct number of col and row handles', () => {
		const container = createMockContainer();
		const tableEl = createMockTable();
		container.appendChild(tableEl);
		const node = createTableBlockNode(2, 3);
		const { getState, dispatch } = stubDeps();

		createTableControls(container, tableEl, node, getState, dispatch);

		const colBar = container.querySelector('.ntbl-col-bar');
		const rowBar = container.querySelector('.ntbl-row-bar');
		expect(colBar?.children.length).toBe(3);
		expect(rowBar?.children.length).toBe(2);
	});

	it('update() rebuilds handles when dimensions change', () => {
		const container = createMockContainer();
		const tableEl = createMockTable();
		container.appendChild(tableEl);
		const node = createTableBlockNode(2, 3);
		const { getState, dispatch } = stubDeps();

		const controls = createTableControls(container, tableEl, node, getState, dispatch);

		const colBar = container.querySelector('.ntbl-col-bar');
		const rowBar = container.querySelector('.ntbl-row-bar');
		expect(colBar?.children.length).toBe(3);
		expect(rowBar?.children.length).toBe(2);

		// Update with new dimensions
		const updatedNode = createTableBlockNode(3, 4, 't1');
		controls.update(updatedNode);

		expect(colBar?.children.length).toBe(4);
		expect(rowBar?.children.length).toBe(3);
	});

	it('update() skips rebuild when dimensions are unchanged', () => {
		const container = createMockContainer();
		const tableEl = createMockTable();
		container.appendChild(tableEl);
		const node = createTableBlockNode(2, 3);
		const { getState, dispatch } = stubDeps();

		const controls = createTableControls(container, tableEl, node, getState, dispatch);

		const colBar = container.querySelector('.ntbl-col-bar') as HTMLDivElement;
		const firstColHandle: Element | null = colBar.children[0] ?? null;

		// Update with same dimensions (different table ID to prove tableId updates)
		const sameSize = createTableBlockNode(2, 3, 't2');
		controls.update(sameSize);

		// Handles should be the same DOM nodes (not rebuilt)
		expect(colBar.children[0]).toBe(firstColHandle);
	});

	it('destroy() removes all control elements from the container', () => {
		const container = createMockContainer();
		const tableEl = createMockTable();
		container.appendChild(tableEl);
		const node = createTableBlockNode(2, 3);
		const { getState, dispatch } = stubDeps();

		const controls = createTableControls(container, tableEl, node, getState, dispatch);

		// Verify elements exist
		expect(container.querySelector('.ntbl-col-bar')).not.toBeNull();

		controls.destroy();

		expect(container.querySelector('.ntbl-col-bar')).toBeNull();
		expect(container.querySelector('.ntbl-row-bar')).toBeNull();
		expect(container.querySelector('.ntbl-insert-line--horizontal')).toBeNull();
		expect(container.querySelector('.ntbl-insert-line--vertical')).toBeNull();
		expect(container.querySelector('.ntbl-add-row')).toBeNull();
		expect(container.querySelector('.ntbl-add-col')).toBeNull();
		expect(container.querySelector('.ntbl-delete-table-btn')).toBeNull();
	});

	it('renders one keyboard-operable separator for every logical column and row', () => {
		const container = createMockContainer();
		const tableEl = createMeasuredTable();
		container.appendChild(tableEl);
		const node = createTableBlockNode(2, 3);
		const { getState, dispatch } = stubDeps();

		createTableControls(container, tableEl, node, getState, dispatch);

		const columns = container.querySelectorAll('.ntbl-resize-separator--column');
		const rows = container.querySelectorAll('.ntbl-resize-separator--row');
		expect(columns).toHaveLength(3);
		expect(rows).toHaveLength(2);
		expect(columns[0]?.getAttribute('role')).toBe('separator');
		expect(columns[0]?.getAttribute('aria-orientation')).toBe('vertical');
		expect(rows[0]?.getAttribute('aria-orientation')).toBe('horizontal');
	});

	it('can disable direct resize without disabling the precise service surface', () => {
		const container = createMockContainer();
		const tableEl = createMeasuredTable();
		container.appendChild(tableEl);
		const node = createTableBlockNode(2, 3);
		const { getState, dispatch } = stubDeps();

		createTableControls(container, tableEl, node, getState, dispatch, undefined, undefined, {
			directResize: false,
		});

		expect(container.querySelector('.ntbl-resize-separator')).toBeNull();
	});

	it('uses configured keyboard steps and the same sizing service transaction path', () => {
		const container = createMockContainer();
		const tableEl = createMeasuredTable();
		container.appendChild(tableEl);
		const node = createTableBlockNode(2, 3);
		const { getState, dispatch } = stubDepsForNode(node);
		const service = {
			setSize: vi.fn(() => true),
			resetSize: vi.fn(() => true),
		} as unknown as TableSizingService;
		const context = {
			isReadOnly: () => false,
			getService: (key: unknown) => (key === TableSizingServiceKey ? service : undefined),
			announce: vi.fn(),
		} as unknown as PluginContext;
		createTableControls(container, tableEl, node, getState, dispatch, context, undefined, {
			keyboardResizeStepPx: 7,
			keyboardResizeLargeStepPx: 25,
		});
		const separator = container.querySelector<HTMLButtonElement>('.ntbl-resize-separator--column');

		separator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		separator?.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
		);
		separator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));

		expect(service.setSize).toHaveBeenNthCalledWith(
			1,
			{ kind: 'column', tableId: 't1', column: 0 },
			{ columnWidthPx: 107 },
		);
		expect(service.setSize).toHaveBeenNthCalledWith(
			2,
			{ kind: 'column', tableId: 't1', column: 0 },
			{ columnWidthPx: 125 },
		);
		expect(service.resetSize).toHaveBeenCalledWith(
			{ kind: 'column', tableId: 't1', column: 0 },
			'columnWidthPx',
		);
	});

	it('restores separator focus when a sizing dispatch focuses the editor surface', () => {
		const container = createMockContainer();
		container.tabIndex = -1;
		const tableEl = createMeasuredTable();
		container.appendChild(tableEl);
		const node = createTableBlockNode(2, 3);
		const { getState, dispatch } = stubDepsForNode(node);
		const service = {
			setSize: vi.fn(() => {
				container.focus();
				return true;
			}),
			resetSize: vi.fn(() => {
				container.focus();
				return true;
			}),
		} as unknown as TableSizingService;
		const context = {
			isReadOnly: () => false,
			getService: (key: unknown) => (key === TableSizingServiceKey ? service : undefined),
			announce: vi.fn(),
		} as unknown as PluginContext;
		createTableControls(container, tableEl, node, getState, dispatch, context);
		const separator = container.querySelector<HTMLButtonElement>('.ntbl-resize-separator--column');
		if (!separator) throw new Error('Expected column separator');

		separator.focus();
		separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		expect(document.activeElement).toBe(separator);

		separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
		expect(document.activeElement).toBe(separator);
	});

	it('commits a pointer resize once and cancels a later preview with Escape', () => {
		const container = createMockContainer();
		const tableEl = createMeasuredTable();
		container.appendChild(tableEl);
		const node = {
			...createTableBlockNode(2, 3),
			attrs: { columnWidthsPx: [100, null, null] },
		};
		const { getState, dispatch } = stubDepsForNode(node);
		const service = {
			setSize: vi.fn(() => true),
		} as unknown as TableSizingService;
		const context = {
			isReadOnly: () => false,
			getService: (key: unknown) => (key === TableSizingServiceKey ? service : undefined),
			announce: vi.fn(),
		} as unknown as PluginContext;
		createTableControls(container, tableEl, node, getState, dispatch, context);
		const separator = container.querySelector<HTMLButtonElement>('.ntbl-resize-separator--column');
		if (!separator) throw new Error('Expected column separator');

		separator.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 20 }));
		document.dispatchEvent(pointerEvent('pointermove', { clientX: 142, clientY: 20 }));
		expect(service.setSize).not.toHaveBeenCalled();
		expect(tableEl.querySelector('col')?.getAttribute('width')).toBe('142');
		document.dispatchEvent(pointerEvent('pointerup', { clientX: 142, clientY: 20 }));
		expect(service.setSize).toHaveBeenCalledOnce();
		expect(service.setSize).toHaveBeenCalledWith(
			{ kind: 'column', tableId: 't1', column: 0 },
			{ columnWidthPx: 142 },
		);

		vi.mocked(service.setSize).mockClear();
		separator.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 20 }));
		document.dispatchEvent(pointerEvent('pointermove', { clientX: 160, clientY: 20 }));
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(service.setSize).not.toHaveBeenCalled();
		expect(tableEl.querySelector('col')?.style.width).toBe('100px');
		expect(tableEl.querySelector('col')?.hasAttribute('width')).toBe(false);
	});

	it('turns row and column handles into logical selections and disables controls in read-only', () => {
		const container = createMockContainer();
		const tableEl = createMeasuredTable();
		container.appendChild(tableEl);
		const node = createTableBlockNode(2, 3);
		const { getState, dispatch } = stubDepsForNode(node);
		const selectionService = { setSelectedRange: vi.fn(), getSelectedRange: vi.fn(() => null) };
		const context = {
			isReadOnly: () => false,
			getService: (key: unknown) =>
				key === TableSelectionServiceKey ? selectionService : undefined,
		} as unknown as PluginContext;
		const controls = createTableControls(container, tableEl, node, getState, dispatch, context);

		container.querySelector<HTMLButtonElement>('.ntbl-col-handle .ntbl-handle-select')?.click();
		expect(selectionService.setSelectedRange).toHaveBeenCalledWith({
			tableId: 't1',
			fromRow: 0,
			fromCol: 0,
			toRow: 1,
			toCol: 0,
		});

		controls.setReadOnly(true);
		expect(container.hasAttribute('data-notectl-table-readonly')).toBe(true);
		expect(
			Array.from(container.querySelectorAll<HTMLButtonElement>('.ntbl-resize-separator')).every(
				(button) => button.disabled,
			),
		).toBe(true);
	});
});
