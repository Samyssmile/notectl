/**
 * NodeViewFactories for table, table_row, and table_cell.
 * Provides custom DOM rendering with proper HTML table elements and ARIA.
 * The table NodeView includes interactive controls for row/column management.
 */

import type { BlockNode } from '../../model/Document.js';
import { getBlockChildren, isLeafBlock } from '../../model/Document.js';
import type { SchemaRegistry } from '../../model/SchemaRegistry.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { NodeView, NodeViewFactory } from '../../view/NodeView.js';
import { renderBlockContent } from '../../view/Reconciler.js';
import { type TableControlsHandle, createTableControls } from './TableControls.js';

/**
 * Creates a NodeViewFactory for the table node type.
 * Renders as outer container with controls + table + tbody.
 */
export function createTableNodeViewFactory(_registry: SchemaRegistry): NodeViewFactory {
	return (
		node: BlockNode,
		getState: () => EditorState,
		dispatch: (tr: Transaction) => void,
	): NodeView => {
		// Outer container: holds controls + wrapper
		const container: HTMLDivElement = document.createElement('div');
		container.className = 'ntbl-container';
		container.setAttribute('data-block-id', node.id);
		container.setAttribute('data-selectable', 'true');

		// Table wrapper: provides overflow scrolling
		const wrapper: HTMLDivElement = document.createElement('div');
		wrapper.className = 'notectl-table-wrapper';

		const table: HTMLTableElement = document.createElement('table');
		table.className = 'notectl-table';
		table.setAttribute('role', 'table');

		const rows: readonly BlockNode[] = getBlockChildren(node);
		const totalRows: number = rows.length;
		const totalCols: number = rows[0] ? getBlockChildren(rows[0]).length : 0;
		table.setAttribute('aria-label', `Table with ${totalRows} rows and ${totalCols} columns`);

		const tbody: HTMLTableSectionElement = document.createElement('tbody');
		table.appendChild(tbody);
		wrapper.appendChild(table);
		container.appendChild(wrapper);

		// Live region for screen reader announcements
		const liveRegion: HTMLDivElement = document.createElement('div');
		liveRegion.className = 'notectl-sr-only';
		liveRegion.setAttribute('aria-live', 'polite');
		liveRegion.setAttribute('aria-atomic', 'true');
		container.appendChild(liveRegion);

		// Initialize interactive controls
		const controls: TableControlsHandle = createTableControls(
			container,
			table,
			node,
			getState,
			dispatch,
		);

		return {
			dom: container,
			contentDOM: tbody,
			update(updatedNode: BlockNode): boolean {
				if (updatedNode.type !== 'table') return false;
				container.setAttribute('data-block-id', updatedNode.id);
				container.setAttribute('data-selectable', 'true');
				const updatedRows: readonly BlockNode[] = getBlockChildren(updatedNode);
				const newTotalRows: number = updatedRows.length;
				const newTotalCols: number = updatedRows[0] ? getBlockChildren(updatedRows[0]).length : 0;
				table.setAttribute(
					'aria-label',
					`Table with ${newTotalRows} rows and ${newTotalCols} columns`,
				);

				// Update controls to reflect new structure
				controls.update(updatedNode);

				return false;
			},
			destroy(): void {
				controls.destroy();
			},
			selectNode(): void {
				container.classList.add('notectl-table--selected');
			},
			deselectNode(): void {
				container.classList.remove('notectl-table--selected');
			},
		};
	};
}

/**
 * Creates a NodeViewFactory for the table_row node type.
 * Renders as `<tr role="row">`.
 */
export function createTableRowNodeViewFactory(_registry: SchemaRegistry): NodeViewFactory {
	return (
		node: BlockNode,
		_getState: () => EditorState,
		_dispatch: (tr: Transaction) => void,
	): NodeView => {
		const tr: HTMLTableRowElement = document.createElement('tr');
		tr.setAttribute('data-block-id', node.id);
		tr.setAttribute('role', 'row');

		return {
			dom: tr,
			contentDOM: tr,
			update(updatedNode: BlockNode): boolean {
				if (updatedNode.type !== 'table_row') return false;
				tr.setAttribute('data-block-id', updatedNode.id);
				return false;
			},
			destroy(): void {
				// No cleanup needed
			},
		};
	};
}

/**
 * Creates a NodeViewFactory for the table_cell node type.
 * Renders as `<td role="cell">` with text content rendered inside.
 */
export function createTableCellNodeViewFactory(registry: SchemaRegistry): NodeViewFactory {
	return (
		node: BlockNode,
		_getState: () => EditorState,
		_dispatch: (tr: Transaction) => void,
	): NodeView => {
		const td: HTMLTableCellElement = document.createElement('td');
		td.setAttribute('data-block-id', node.id);
		td.setAttribute('role', 'cell');

		const colspan: number = (node.attrs?.colspan as number | undefined) ?? 1;
		const rowspan: number = (node.attrs?.rowspan as number | undefined) ?? 1;
		if (colspan > 1) td.colSpan = colspan;
		if (rowspan > 1) td.rowSpan = rowspan;

		// Apply text alignment from TextAlignmentPlugin's patched attribute
		const textAlign: string | undefined = node.attrs?.textAlign as string | undefined;
		if (textAlign && textAlign !== 'left') {
			td.style.textAlign = textAlign;
		}

		// Render text content only for leaf cells (cells with block children
		// like images are rendered by the Reconciler via contentDOM)
		if (isLeafBlock(node)) {
			renderBlockContent(td, node, registry);
		}

		return {
			dom: td,
			contentDOM: td,
			update(updatedNode: BlockNode): boolean {
				if (updatedNode.type !== 'table_cell') return false;
				td.setAttribute('data-block-id', updatedNode.id);

				const newColspan: number = (updatedNode.attrs?.colspan as number | undefined) ?? 1;
				const newRowspan: number = (updatedNode.attrs?.rowspan as number | undefined) ?? 1;
				if (newColspan > 1) {
					td.colSpan = newColspan;
				} else {
					td.removeAttribute('colspan');
				}
				if (newRowspan > 1) {
					td.rowSpan = newRowspan;
				} else {
					td.removeAttribute('rowspan');
				}

				return false;
			},
			destroy(): void {
				// No cleanup needed
			},
		};
	};
}
