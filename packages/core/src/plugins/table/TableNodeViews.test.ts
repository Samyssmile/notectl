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
