import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
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
});
