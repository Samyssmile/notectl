import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBuiltinSpecs } from '../../editor/BuiltinSpecs.js';
import {
	type BlockNode,
	createBlockNode,
	createTextNode,
	getBlockChildren,
} from '../../model/Document.js';
import type { BlockId, NodeTypeName } from '../../model/TypeBrands.js';
import { PluginManager } from '../PluginManager.js';
import { tableFragmentPlainText } from './TableClipboard.js';
import { TablePlugin } from './TablePlugin.js';
import { TableSelectionServiceKey } from './TableSelection.js';
import { createTableState } from './TableTestUtils.js';

const managers: PluginManager[] = [];

afterEach(async () => {
	for (const manager of managers.splice(0)) await manager.destroy();
});

async function setup() {
	const manager = new PluginManager();
	managers.push(manager);
	registerBuiltinSpecs(manager.schemaRegistry);
	manager.register(new TablePlugin());
	const container: HTMLDivElement = document.createElement('div');
	let state = createTableState({
		rows: 2,
		cols: 3,
		extraBlocks: 'after',
		cellText: (row, column) => `${String(row)}:${String(column)}`,
	});
	const table = state.getBlock('t1' as BlockId);
	if (!table) throw new Error('Expected test table');
	const rows: readonly BlockNode[] = getBlockChildren(table);
	const sizedTable: BlockNode = {
		...table,
		attrs: { columnWidthsPx: [80, 120, 160] },
		children: rows.map((row, index) =>
			index === 1 ? { ...row, attrs: { minHeightPx: 44 } } : row,
		),
	};
	state = state.apply(
		state
			.transaction('api')
			.setNodeAttr(['t1' as BlockId], sizedTable.attrs)
			.setNodeAttr(['t1' as BlockId, 'row1' as BlockId], { minHeightPx: 44 })
			.build(),
	);
	const dispatch = vi.fn((transaction) => {
		state = state.apply(transaction);
	});
	await manager.init({
		getState: () => state,
		dispatch,
		getContainer: () => container,
		getPluginContainer: () => document.createElement('div'),
	});
	const selection = manager.getService(TableSelectionServiceKey);
	if (!selection) throw new Error('Expected table selection service');
	selection.setSelectedRange({
		tableId: 't1' as BlockId,
		fromRow: 1,
		fromCol: 1,
		toRow: 1,
		toCol: 2,
	});
	return { container, dispatch, getState: () => state, selection };
}

describe('table selection clipboard integration', () => {
	it('keeps logical TSV columns aligned across colspan and rowspan', () => {
		const paragraph = (id: string, text: string): BlockNode =>
			createBlockNode('paragraph' as NodeTypeName, [createTextNode(text)], `p-${id}` as BlockId);
		const cell = (
			id: string,
			text: string,
			attrs?: { readonly colspan?: number; readonly rowspan?: number },
		): BlockNode =>
			createBlockNode('table_cell' as NodeTypeName, [paragraph(id, text)], id as BlockId, attrs);
		const table = createBlockNode(
			'table' as NodeTypeName,
			[
				createBlockNode(
					'table_row' as NodeTypeName,
					[cell('a', 'A', { colspan: 2, rowspan: 2 }), cell('b', 'B')],
					'r0' as BlockId,
				),
				createBlockNode('table_row' as NodeTypeName, [cell('c', 'C')], 'r1' as BlockId),
			],
			'table' as BlockId,
		);

		expect(tableFragmentPlainText(table)).toBe('A\t\tB\n\t\tC');
	});

	it('copies the logical rectangle with projected dimensions', async () => {
		const { container } = await setup();
		const clipboard = new DataTransfer();
		container.dispatchEvent(
			new ClipboardEvent('copy', { clipboardData: clipboard, bubbles: true }),
		);

		expect(clipboard.getData('text/plain')).toBe('1:1\t1:2');
		const html: string = clipboard.getData('text/html');
		expect(html).toContain('data-notectl-width-px="120"');
		expect(html).toContain('data-notectl-width-px="160"');
		expect(html).toContain('data-notectl-min-height-px="44"');
		expect(html).not.toContain('data-notectl-width-px="80"');
	});

	it('cuts cell contents in one transaction while preserving table dimensions', async () => {
		const { container, dispatch, getState, selection } = await setup();
		dispatch.mockClear();
		const clipboard = new DataTransfer();
		container.dispatchEvent(new ClipboardEvent('cut', { clipboardData: clipboard, bubbles: true }));

		expect(dispatch).toHaveBeenCalledOnce();
		expect(getState().getBlock('t1' as BlockId)?.attrs?.columnWidthsPx).toEqual([80, 120, 160]);
		expect(getState().getBlock('row1' as BlockId)?.attrs?.minHeightPx).toBe(44);
		expect(selection.getSelectedRange()).toBeNull();
	});

	it('leaves clipboard events from non-editable table controls native', async () => {
		const { container, dispatch } = await setup();
		dispatch.mockClear();
		const popup: HTMLDivElement = document.createElement('div');
		popup.contentEditable = 'false';
		const input: HTMLInputElement = document.createElement('input');
		input.value = '210';
		popup.appendChild(input);
		container.appendChild(popup);
		const clipboard = new DataTransfer();
		const copy = new ClipboardEvent('copy', {
			clipboardData: clipboard,
			bubbles: true,
			cancelable: true,
		});
		const cut = new ClipboardEvent('cut', {
			clipboardData: clipboard,
			bubbles: true,
			cancelable: true,
		});

		input.dispatchEvent(copy);
		input.dispatchEvent(cut);

		expect(copy.defaultPrevented).toBe(false);
		expect(cut.defaultPrevented).toBe(false);
		expect(dispatch).not.toHaveBeenCalled();
	});
});
