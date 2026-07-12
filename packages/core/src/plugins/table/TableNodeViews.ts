/**
 * NodeViewFactories for table, table_row, and table_cell.
 * Provides custom DOM rendering with proper HTML table elements and ARIA.
 * The table NodeView includes interactive controls for row/column management.
 */

import type { BlockAttrs, BlockNode } from '../../model/Document.js';
import { blockAttrsEqual, getBlockChildren } from '../../model/Document.js';
import type { SchemaRegistry } from '../../model/SchemaRegistry.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { removeStyleProperty, setStyleProperty } from '../../style/StyleRuntime.js';
import type { NodeView, NodeViewFactory } from '../../view/NodeView.js';
import type { PluginContext } from '../Plugin.js';
import { getDeepActiveHTMLElement } from '../shared/PopupPositioning.js';
import { type TableContextMenuHandle, createTableContextMenu } from './TableContextMenu.js';
import {
	type TableControlsConfig,
	type TableControlsHandle,
	createTableControls,
} from './TableControls.js';
import { createTableGrid } from './TableGrid.js';
import { findTableContext } from './TableHelpers.js';
import { TABLE_LOCALE_EN, type TableLocale } from './TableLocale.js';
import { TableSelectionServiceKey } from './TableSelection.js';

/** NodeView subset of the table sizing configuration. */
export type TableNodeViewSizingConfig = TableControlsConfig;

const DEFAULT_SIZING_CONFIG: TableNodeViewSizingConfig = {
	minColumnWidthPx: 60,
	minRowHeightPx: 24,
	maxColumnWidthPx: 10_000,
	maxRowHeightPx: 10_000,
	keyboardResizeStepPx: 8,
	keyboardResizeLargeStepPx: 32,
	directResize: true,
};

export interface TableNodeViewLifecycle {
	onControlsCreated?(controls: TableControlsHandle): void;
	onControlsDestroyed?(controls: TableControlsHandle): void;
}

/**
 * Creates a NodeViewFactory for the table node type.
 * Renders as outer container with controls + table + tbody.
 */
export function createTableNodeViewFactory(
	_registry: SchemaRegistry,
	pluginContext?: PluginContext,
	locale: TableLocale = TABLE_LOCALE_EN,
	sizingConfig: TableNodeViewSizingConfig = DEFAULT_SIZING_CONFIG,
	lifecycle: TableNodeViewLifecycle = {},
): NodeViewFactory {
	return (
		node: BlockNode,
		getState: () => EditorState,
		dispatch: (tr: Transaction) => void,
	): NodeView => {
		let currentNode: BlockNode = node;
		// Outer container: holds controls + wrapper
		const container: HTMLDivElement = document.createElement('div');
		container.className = 'ntbl-container';
		container.setAttribute('data-block-id', node.id);
		container.setAttribute('data-selectable', 'true');

		// Table wrapper: provides overflow scrolling
		const wrapper: HTMLDivElement = document.createElement('div');
		wrapper.className = 'notectl-table-wrapper';
		wrapper.setAttribute('part', 'table');

		const table: HTMLTableElement = document.createElement('table');
		table.className = 'notectl-table';
		table.setAttribute('role', 'table');

		const colgroup: HTMLTableColElement = document.createElement('colgroup');
		colgroup.className = 'notectl-table-columns';
		table.appendChild(colgroup);

		const rows: readonly BlockNode[] = getBlockChildren(node);
		const totalRows: number = rows.length;
		const totalCols: number = createTableGrid(node).columnCount;
		table.setAttribute('aria-label', locale.tableAriaLabel(totalRows, totalCols));
		table.setAttribute('aria-description', locale.tableAriaDescription);

		const tbody: HTMLTableSectionElement = document.createElement('tbody');
		table.appendChild(tbody);
		wrapper.appendChild(table);
		container.appendChild(wrapper);

		// Apply border color CSS variable from node attrs
		applyBorderColor(table, node.attrs?.borderColor as string | undefined);
		applyColumnDimensions(table, colgroup, node, sizingConfig);

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
			pluginContext,
			locale,
			sizingConfig,
		);
		controls.setReadOnly(pluginContext?.isReadOnly?.() ?? false);
		lifecycle.onControlsCreated?.(controls);
		let destroyed = false;
		const mountedStyleFrame: number = requestAnimationFrame(() => {
			if (destroyed) return;
			// NodeViews are constructed before insertion into the registered style
			// root. Re-applying after mount migrates fallback inline declarations to
			// CSP-safe runtime tokens through StyleRuntime.
			applyBorderColor(table, currentNode.attrs?.borderColor as string | undefined);
			applyColumnDimensions(table, colgroup, currentNode, sizingConfig);
			applyRenderedRowHeights(tbody, currentNode);
		});

		// Context menu on right-click
		let activeContextMenu: TableContextMenuHandle | null = null;
		let currentTableId = node.id;

		const onContextMenu = (e: MouseEvent): void => {
			if (!pluginContext || pluginContext.isReadOnly?.()) return;
			e.preventDefault();
			e.stopPropagation();

			activeContextMenu?.close();

			const rect: DOMRect = new DOMRect(e.clientX, e.clientY, 0, 0);
			const cell = (e.target as Element | null)?.closest('td[data-block-id]');
			const cellId = cell?.getAttribute('data-block-id');
			const tableContext = cellId
				? findTableContext(pluginContext.getState(), cellId as BlockId)
				: null;
			const selectedCell: boolean = cellId
				? (pluginContext.getService?.(TableSelectionServiceKey)?.isSelected(cellId as BlockId) ??
					false)
				: false;
			const restoreFocusTo: HTMLElement | null =
				getDeepActiveHTMLElement(container) ?? (cell instanceof HTMLElement ? cell : null);
			activeContextMenu = createTableContextMenu(
				container,
				pluginContext,
				currentTableId,
				rect,
				() => {
					activeContextMenu = null;
				},
				locale,
				undefined,
				{
					sizeTarget:
						tableContext && !selectedCell
							? {
									kind: 'cell',
									tableId: tableContext.tableId,
									row: tableContext.rowIndex,
									column: tableContext.colIndex,
								}
							: undefined,
					sizingConfig,
					restoreFocusTo,
				},
			);
		};
		table.addEventListener('contextmenu', onContextMenu);

		return {
			dom: container,
			contentDOM: tbody,
			update(updatedNode: BlockNode): boolean {
				if (updatedNode.type !== 'table') return false;
				const canUpdateInPlace: boolean = tableContentIsStable(currentNode, updatedNode);
				if (!canUpdateInPlace) return false;

				currentTableId = updatedNode.id;
				container.setAttribute('data-block-id', updatedNode.id);
				container.setAttribute('data-selectable', 'true');
				const updatedRows: readonly BlockNode[] = getBlockChildren(updatedNode);
				const newTotalRows: number = updatedRows.length;
				const newTotalCols: number = createTableGrid(updatedNode).columnCount;
				table.setAttribute('aria-label', locale.tableAriaLabel(newTotalRows, newTotalCols));

				// Update border color CSS variable
				applyBorderColor(table, updatedNode.attrs?.borderColor as string | undefined);
				applyColumnDimensions(table, colgroup, updatedNode, sizingConfig);
				applyRenderedRowHeights(tbody, updatedNode);

				// Update controls to reflect new structure
				controls.update(updatedNode);
				currentNode = updatedNode;

				return true;
			},
			destroy(): void {
				destroyed = true;
				cancelAnimationFrame(mountedStyleFrame);
				activeContextMenu?.destroy();
				table.removeEventListener('contextmenu', onContextMenu);
				lifecycle.onControlsDestroyed?.(controls);
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

/** Applies border color CSS variable and borderless class to a table element. */
function applyBorderColor(table: HTMLTableElement, borderColor: string | undefined): void {
	if (borderColor === 'none') {
		setStyleProperty(table, '--ntbl-border-color', 'transparent');
		table.classList.add('notectl-table--borderless');
	} else if (borderColor) {
		setStyleProperty(table, '--ntbl-border-color', borderColor);
		table.classList.remove('notectl-table--borderless');
	} else {
		removeStyleProperty(table, '--ntbl-border-color');
		table.classList.remove('notectl-table--borderless');
	}
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
		let currentNode: BlockNode = node;
		const tr: HTMLTableRowElement = document.createElement('tr');
		tr.setAttribute('data-block-id', node.id);
		tr.setAttribute('role', 'row');
		tr.setAttribute('part', 'table-row');
		applyRowMinimumHeight(tr, node);
		let destroyed = false;
		const mountedStyleFrame: number = requestAnimationFrame(() => {
			if (!destroyed) applyRowMinimumHeight(tr, currentNode);
		});

		return {
			dom: tr,
			contentDOM: tr,
			update(updatedNode: BlockNode): boolean {
				if (updatedNode.type !== 'table_row') return false;
				if (updatedNode.children !== currentNode.children) return false;
				tr.setAttribute('data-block-id', updatedNode.id);
				applyRowMinimumHeight(tr, updatedNode);
				currentNode = updatedNode;
				return true;
			},
			destroy(): void {
				destroyed = true;
				cancelAnimationFrame(mountedStyleFrame);
			},
		};
	};
}

/** Applies canonical widths through a semantic `<colgroup>` and table minimum width. */
export function applyColumnDimensions(
	table: HTMLTableElement,
	colgroup: HTMLTableColElement,
	node: BlockNode,
	config: TableNodeViewSizingConfig = DEFAULT_SIZING_CONFIG,
): void {
	const columnCount: number = createTableGrid(node).columnCount;
	setStyleProperty(table, '--ntbl-min-column-width', `${String(config.minColumnWidthPx)}px`);
	while (colgroup.children.length > columnCount) colgroup.lastElementChild?.remove();
	while (colgroup.children.length < columnCount) {
		colgroup.appendChild(document.createElement('col'));
	}

	const rawWidths: unknown = node.attrs?.columnWidthsPx;
	const widths: readonly unknown[] = Array.isArray(rawWidths) ? rawWidths : [];
	let minimumTableWidth = 0;
	for (let column = 0; column < columnCount; column++) {
		const col = colgroup.children[column] as HTMLTableColElement | undefined;
		if (!col) continue;
		col.removeAttribute('width');
		const rawWidth: unknown = widths[column];
		const explicitWidth: number | undefined =
			typeof rawWidth === 'number' && Number.isFinite(rawWidth) && rawWidth > 0
				? rawWidth
				: undefined;
		if (explicitWidth !== undefined) {
			setStyleProperty(col, 'width', `${String(explicitWidth)}px`);
			col.setAttribute('data-notectl-width-px', String(explicitWidth));
		} else {
			removeStyleProperty(col, 'width');
			col.removeAttribute('data-notectl-width-px');
		}
		minimumTableWidth += explicitWidth ?? config.minColumnWidthPx;
	}
	if (columnCount > 0) {
		setStyleProperty(table, 'minWidth', `${String(minimumTableWidth)}px`);
		if (
			widths.length >= columnCount &&
			widths.slice(0, columnCount).every((width) => typeof width === 'number')
		) {
			setStyleProperty(table, 'width', `${String(minimumTableWidth)}px`);
		} else {
			removeStyleProperty(table, 'width');
		}
	} else {
		removeStyleProperty(table, 'minWidth');
		removeStyleProperty(table, 'width');
	}
}

/** Applies a row's table-semantic minimum height (`height` grows with content). */
export function applyRowMinimumHeight(row: HTMLTableRowElement, node: BlockNode): void {
	const rawHeight: unknown = node.attrs?.minHeightPx;
	row.removeAttribute('height');
	if (typeof rawHeight === 'number' && Number.isFinite(rawHeight) && rawHeight > 0) {
		setStyleProperty(row, 'height', `${String(rawHeight)}px`);
		row.setAttribute('data-notectl-min-height-px', String(rawHeight));
	} else {
		removeStyleProperty(row, 'height');
		row.removeAttribute('data-notectl-min-height-px');
	}
}

function applyRenderedRowHeights(tbody: HTMLTableSectionElement, tableNode: BlockNode): void {
	const renderedRows: readonly HTMLTableRowElement[] = Array.from(
		tbody.querySelectorAll(':scope > tr'),
	);
	for (const rowNode of getBlockChildren(tableNode)) {
		const row = renderedRows.find(
			(candidate) => candidate.getAttribute('data-block-id') === rowNode.id,
		);
		if (row) applyRowMinimumHeight(row, rowNode);
	}
}

/** True when only table sizing/border attrs or row minimum heights changed. */
function tableContentIsStable(previous: BlockNode, next: BlockNode): boolean {
	if (previous.id !== next.id || previous.htmlId !== next.htmlId) return false;
	if (!blockAttrsEqual(withoutTableViewAttrs(previous.attrs), withoutTableViewAttrs(next.attrs))) {
		return false;
	}
	const previousRows: readonly BlockNode[] = getBlockChildren(previous);
	const nextRows: readonly BlockNode[] = getBlockChildren(next);
	if (previousRows.length !== nextRows.length) return false;
	return previousRows.every((previousRow, index) => {
		const nextRow: BlockNode | undefined = nextRows[index];
		return (
			nextRow !== undefined &&
			previousRow.id === nextRow.id &&
			previousRow.htmlId === nextRow.htmlId &&
			previousRow.children === nextRow.children &&
			blockAttrsEqual(withoutRowHeight(previousRow.attrs), withoutRowHeight(nextRow.attrs))
		);
	});
}

function withoutTableViewAttrs(attrs: BlockAttrs | undefined): BlockAttrs | undefined {
	if (!attrs) return undefined;
	const { borderColor: _borderColor, columnWidthsPx: _columnWidthsPx, ...rest } = attrs;
	return Object.keys(rest).length > 0 ? rest : undefined;
}

function withoutRowHeight(attrs: BlockAttrs | undefined): BlockAttrs | undefined {
	if (!attrs) return undefined;
	const { minHeightPx: _minHeightPx, ...rest } = attrs;
	return Object.keys(rest).length > 0 ? rest : undefined;
}

/**
 * Creates a NodeViewFactory for the table_cell node type.
 * Renders as `<td role="cell">` with text content rendered inside.
 */
export function createTableCellNodeViewFactory(_registry: SchemaRegistry): NodeViewFactory {
	return (
		node: BlockNode,
		_getState: () => EditorState,
		_dispatch: (tr: Transaction) => void,
	): NodeView => {
		const td: HTMLTableCellElement = document.createElement('td');
		td.setAttribute('data-block-id', node.id);
		td.setAttribute('role', 'cell');
		td.setAttribute('part', 'table-cell');

		const colspan: number = (node.attrs?.colspan as number | undefined) ?? 1;
		const rowspan: number = (node.attrs?.rowspan as number | undefined) ?? 1;
		if (colspan > 1) td.colSpan = colspan;
		if (rowspan > 1) td.rowSpan = rowspan;

		// Apply alignment from AlignmentPlugin's patched attribute
		const align: string | undefined = node.attrs?.align as string | undefined;
		if (align && align !== 'left') {
			setStyleProperty(td, 'textAlign', align);
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
