import { describe, expect, it } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../../model/Document.js';
import { SchemaRegistry } from '../../model/SchemaRegistry.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { createTableNodeViewFactory } from './TableNodeViews.js';

describe('TableNodeView', () => {
	it('applies and removes selected class through selectNode/deselectNode', () => {
		const tableNode = createBlockNode(
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

		const state = EditorState.create({
			doc: createDocument([tableNode]),
			selection: createCollapsedSelection('p1', 0),
			schema: {
				nodeTypes: ['paragraph', 'table', 'table_row', 'table_cell'],
				markTypes: ['bold', 'italic', 'underline'],
			},
		});

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
