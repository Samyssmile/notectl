import { describe, expect, it } from 'vitest';
import type { BlockNode } from '../../model/Document.js';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { SchemaRegistry } from '../../model/SchemaRegistry.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import type { NodeView } from '../../view/NodeView.js';
import { renderBlock } from '../../view/Reconciler.js';
import {
	createTableCellNodeViewFactory,
	createTableNodeViewFactory,
	createTableRowNodeViewFactory,
} from './TableNodeViews.js';
import { TablePlugin } from './TablePlugin.js';

function createTableBlock(): BlockNode {
	return createBlockNode(
		'table',
		[
			createBlockNode(
				'table_row',
				[
					createBlockNode(
						'table_cell',
						[createBlockNode('paragraph', [createTextNode('')], 'p1')],
						'c1',
					),
				],
				'r1',
			),
		],
		't1',
	);
}

function createSizedTableBlock(): BlockNode {
	const cells = [0, 1, 2].map((index) =>
		createBlockNode(
			'table_cell',
			[createBlockNode('paragraph', [createTextNode(String(index))], `p${index}`)],
			`c${index}`,
		),
	);
	return createBlockNode(
		'table',
		[createBlockNode('table_row', cells, 'r1', { minHeightPx: 48 })],
		't1',
		{ columnWidthsPx: [120, null, 240] },
	);
}

function createTableState(tableNode: BlockNode): EditorState {
	return EditorState.create({
		doc: createDocument([tableNode]),
		selection: createCollapsedSelection('p1', 0),
		schema: {
			nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell'],
			markTypes: ['bold', 'italic', 'underline'],
		},
	});
}

describe('TableNodeView', () => {
	it('applies and removes selected class through selectNode/deselectNode', () => {
		const tableNode = createTableBlock();
		const state = createTableState(tableNode);
		const factory = createTableNodeViewFactory(new SchemaRegistry());
		const nodeView = factory(
			tableNode,
			() => state,
			(_tr: Transaction) => {
				// No-op
			},
		);

		expect(nodeView.dom.classList.contains('notectl-table--selected')).toBe(false);

		nodeView.selectNode?.();
		expect(nodeView.dom.classList.contains('notectl-table--selected')).toBe(true);

		nodeView.deselectNode?.();
		expect(nodeView.dom.classList.contains('notectl-table--selected')).toBe(false);

		nodeView.destroy?.();
	});

	it('renders one semantic col per logical column and applies explicit widths', () => {
		const tableNode = createSizedTableBlock();
		const state = createTableState(tableNode);
		const nodeView = createTableNodeViewFactory(new SchemaRegistry())(
			tableNode,
			() => state,
			() => {},
		);
		const table = nodeView.dom.querySelector('table') as HTMLTableElement;
		const columns = table.querySelectorAll(':scope > colgroup > col');

		expect(columns).toHaveLength(3);
		expect(columns[0]?.getAttribute('data-notectl-width-px')).toBe('120');
		expect(columns[1]?.hasAttribute('data-notectl-width-px')).toBe(false);
		expect(columns[2]?.getAttribute('data-notectl-width-px')).toBe('240');
		expect(table.style.minWidth).toBe('420px');
		nodeView.destroy?.();
	});

	it('updates column dimensions in place for a sizing-only transaction', () => {
		const tableNode = createSizedTableBlock();
		const state = createTableState(tableNode);
		const nodeView = createTableNodeViewFactory(new SchemaRegistry())(
			tableNode,
			() => state,
			() => {},
		);
		const tableBefore = nodeView.dom.querySelector('table');
		const updated: BlockNode = {
			...tableNode,
			attrs: { columnWidthsPx: [160, 180, null] },
		};

		expect(nodeView.update?.(updated)).toBe(true);
		expect(nodeView.dom.querySelector('table')).toBe(tableBefore);
		const columns = nodeView.dom.querySelectorAll('col');
		expect(columns[0]?.getAttribute('data-notectl-width-px')).toBe('160');
		expect(columns[1]?.getAttribute('data-notectl-width-px')).toBe('180');
		expect(columns[2]?.hasAttribute('data-notectl-width-px')).toBe(false);
		nodeView.destroy?.();
	});

	it('uses the exact summed table width when every logical column is explicit', () => {
		const sized: BlockNode = {
			...createSizedTableBlock(),
			attrs: { columnWidthsPx: [120, 240, 160] },
		};
		const state = createTableState(sized);
		const nodeView = createTableNodeViewFactory(new SchemaRegistry())(
			sized,
			() => state,
			() => {},
		);
		const table = nodeView.dom.querySelector('table') as HTMLTableElement;

		expect(table.style.width).toBe('520px');
		expect(table.style.minWidth).toBe('520px');
		nodeView.destroy?.();
	});
});

describe('TableNodeView shadow parts', () => {
	const noopDispatch = (_tr: Transaction): void => {
		// No-op
	};

	it('table NodeView exposes part="table" on the table wrapper', () => {
		const tableNode = createTableBlock();
		const state = createTableState(tableNode);
		const factory = createTableNodeViewFactory(new SchemaRegistry());

		const nodeView: NodeView = factory(tableNode, () => state, noopDispatch);

		const wrapper = nodeView.dom.querySelector('.notectl-table-wrapper');
		expect(wrapper?.getAttribute('part')).toBe('table');
		nodeView.destroy?.();
	});

	it('table_row NodeView exposes part="table-row"', () => {
		const rowNode = createBlockNode('table_row', [], 'r1');
		const state = createTableState(createTableBlock());
		const factory = createTableRowNodeViewFactory(new SchemaRegistry());

		const nodeView: NodeView = factory(rowNode, () => state, noopDispatch);

		expect(nodeView.dom.getAttribute('part')).toBe('table-row');
		nodeView.destroy?.();
	});

	it('table_row applies and removes a content-growing minimum height', () => {
		const rowNode = createBlockNode('table_row', [], 'r1', { minHeightPx: 52 });
		const state = createTableState(createTableBlock());
		const nodeView = createTableRowNodeViewFactory(new SchemaRegistry())(
			rowNode,
			() => state,
			noopDispatch,
		);
		const row = nodeView.dom as HTMLTableRowElement;

		expect(row.style.height).toBe('52px');
		expect(row.getAttribute('data-notectl-min-height-px')).toBe('52');
		expect(nodeView.update?.({ ...rowNode, attrs: undefined })).toBe(true);
		expect(row.style.height).toBe('');
		expect(row.hasAttribute('data-notectl-min-height-px')).toBe(false);
	});

	it('table_cell NodeView exposes part="table-cell"', () => {
		const cellNode = createBlockNode('table_cell', [createTextNode('')], 'c1');
		const state = createTableState(createTableBlock());
		const factory = createTableCellNodeViewFactory(new SchemaRegistry());

		const nodeView: NodeView = factory(cellNode, () => state, noopDispatch);

		expect(nodeView.dom.getAttribute('part')).toBe('table-cell');
		nodeView.destroy?.();
	});

	it('renders all documented table parts through the real render path (#201)', async () => {
		const state = stateBuilder()
			.paragraph('outside', 'p0')
			.cursor('p0', 0)
			.schema(['paragraph', 'table', 'table_row', 'table_cell'], ['bold'])
			.build();
		const h = await pluginHarness(new TablePlugin(), state);

		const tableNode = createTableBlock();
		const nodeViews = new Map<string, NodeView>();
		const el = renderBlock(tableNode, h.pm.schemaRegistry, nodeViews, {
			nodeViewRegistry: h.pm.nodeViewRegistry,
			getState: () => createTableState(tableNode),
			dispatch: noopDispatch,
		});

		expect(el.querySelector('[part="table"]')).not.toBeNull();
		expect(el.querySelector('tr[part="table-row"]')).not.toBeNull();
		expect(el.querySelector('td[part="table-cell"]')).not.toBeNull();
	});
});
