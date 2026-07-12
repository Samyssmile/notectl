import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import { buildDeleteColumnTransaction, buildInsertColumnTransaction } from './TableCommands.js';
import { createTableSelectionService, installMouseSelection } from './TableSelection.js';
import { createTableState } from './TableTestUtils.js';

function createMockContext(
	container: HTMLElement,
	initialState: EditorState,
): { context: PluginContext; getState: () => EditorState } {
	let currentState: EditorState = initialState;
	const context: PluginContext = {
		getState: () => currentState,
		dispatch: vi.fn((tr) => {
			currentState = currentState.apply(tr);
		}),
		getContainer: () => container,
		registerService: vi.fn(),
	} as unknown as PluginContext;
	return { context, getState: () => currentState };
}

function createCell(cellId: string): HTMLTableCellElement {
	const cell: HTMLTableCellElement = document.createElement('td');
	cell.setAttribute('data-block-id', cellId);
	return cell;
}

describe('TableSelection', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('clears the selection anchor after clicking outside a table cell', () => {
		const container: HTMLDivElement = document.createElement('div');
		document.body.appendChild(container);

		const table: HTMLTableElement = document.createElement('table');
		const row0: HTMLTableRowElement = document.createElement('tr');
		const row1: HTMLTableRowElement = document.createElement('tr');
		const cell00 = createCell('c0_0');
		const cell11 = createCell('c1_1');
		row0.appendChild(cell00);
		row1.appendChild(cell11);
		table.append(row0, row1);

		const outside: HTMLDivElement = document.createElement('div');
		outside.textContent = 'outside';
		container.append(table, outside);

		const { context } = createMockContext(container, createTableState({ rows: 2, cols: 2 }));
		const service = createTableSelectionService(context);
		const cleanup = installMouseSelection(context, service);

		cell00.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

		outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

		cell11.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, shiftKey: true }));

		expect(service.getSelectedRange()).toBeNull();

		cleanup();
	});

	it('keeps a logical range while interacting with non-editable table controls', () => {
		const container: HTMLDivElement = document.createElement('div');
		document.body.appendChild(container);
		const { context } = createMockContext(container, createTableState({ rows: 2, cols: 2 }));
		const service = createTableSelectionService(context);
		const cleanup = installMouseSelection(context, service);
		service.setSelectedRange({
			tableId: 't1' as BlockId,
			fromRow: 0,
			fromCol: 0,
			toRow: 1,
			toCol: 1,
		});
		const popup: HTMLDivElement = document.createElement('div');
		popup.contentEditable = 'false';
		const apply: HTMLButtonElement = document.createElement('button');
		popup.appendChild(apply);
		container.appendChild(popup);

		apply.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

		expect(service.getSelectedRange()).toEqual({
			tableId: 't1',
			fromRow: 0,
			fromCol: 0,
			toRow: 1,
			toCol: 1,
		});
		cleanup();
	});

	it('resolves logical ranges through spans without duplicate cell ids', () => {
		const container: HTMLDivElement = document.createElement('div');
		const state = createSpanningState();
		const { context } = createMockContext(container, state);
		const service = createTableSelectionService(context);

		service.setSelectedRange({
			tableId: 't1' as BlockId,
			fromRow: 0,
			fromCol: 0,
			toRow: 1,
			toCol: 1,
		});
		expect(service.getSelectedCellIds()).toEqual(['a']);

		service.setSelectedRange({
			tableId: 't1' as BlockId,
			fromRow: 1,
			fromCol: 1,
			toRow: 1,
			toCol: 2,
		});
		expect(service.getSelectedRange()).toEqual({
			tableId: 't1',
			fromRow: 0,
			fromCol: 0,
			toRow: 1,
			toCol: 2,
		});
		expect(service.getSelectedCellIds()).toEqual(['a', 'b', 'c']);
	});

	it('expands mouse selection to the full rectangles of spanning endpoints', () => {
		const container: HTMLDivElement = document.createElement('div');
		document.body.appendChild(container);
		const cellA = createCell('a');
		const cellC = createCell('c');
		container.append(cellA, cellC);

		const { context } = createMockContext(container, createSpanningState());
		const service = createTableSelectionService(context);
		const cleanup = installMouseSelection(context, service);

		cellA.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		cellC.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

		expect(service.getSelectedRange()).toEqual({
			tableId: 't1',
			fromRow: 0,
			fromCol: 0,
			toRow: 1,
			toCol: 2,
		});
		cleanup();
	});

	it('clears a logical selection after structural edits instead of targeting shifted columns', () => {
		const container: HTMLDivElement = document.createElement('div');
		const { context, getState } = createMockContext(
			container,
			createTableState({ rows: 2, cols: 3 }),
		);
		const service = createTableSelectionService(context);
		service.setSelectedRange({
			tableId: 't1' as BlockId,
			fromRow: 0,
			fromCol: 2,
			toRow: 1,
			toCol: 2,
		});
		const deletion = buildDeleteColumnTransaction(getState(), 't1' as BlockId, 2);
		if (!deletion) throw new Error('Expected column deletion');
		context.dispatch(deletion);
		expect(service.getSelectedRange()).toBeNull();

		service.setSelectedRange({
			tableId: 't1' as BlockId,
			fromRow: 0,
			fromCol: 1,
			toRow: 1,
			toCol: 1,
		});
		const insertion = buildInsertColumnTransaction(getState(), 't1' as BlockId, 0);
		if (!insertion) throw new Error('Expected column insertion');
		context.dispatch(insertion);
		expect(service.getSelectedRange()).toBeNull();
	});
});

function createSpanningState(): EditorState {
	const paragraph = (id: string) =>
		createBlockNode('paragraph' as NodeTypeName, [createTextNode(id)], `p-${id}` as BlockId);
	const cell = (id: string, attrs?: { readonly colspan?: number; readonly rowspan?: number }) =>
		createBlockNode('table_cell' as NodeTypeName, [paragraph(id)], id as BlockId, attrs);
	const table = createBlockNode(
		'table' as NodeTypeName,
		[
			createBlockNode(
				'table_row' as NodeTypeName,
				[cell('a', { colspan: 2, rowspan: 2 }), cell('b')],
				'r0' as BlockId,
			),
			createBlockNode('table_row' as NodeTypeName, [cell('c')], 'r1' as BlockId),
		],
		't1' as BlockId,
	);
	return EditorState.create({
		doc: createDocument([table]),
		selection: createCollapsedSelection('p-a' as BlockId, 0),
	});
}
