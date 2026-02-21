import { describe, expect, it, vi } from 'vitest';
import { createBlockNode, createTextNode, getBlockChildren } from '../../model/Document.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { createTableControls } from './TableControls.js';

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

function stubDeps() {
	const getState = vi.fn() as unknown as () => EditorState;
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
});
