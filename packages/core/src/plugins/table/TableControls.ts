/**
 * Interactive table controls orchestrator.
 * Wires DOM elements (from TableControlsDOM) with layout logic (from TableControlsLayout)
 * and shared transaction builders (from TableCommands) to produce the interactive overlay.
 */

import type { BlockNode } from '../../model/Document.js';
import { getBlockChildren } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { getTableBorderColor, renderBorderColorPicker } from './TableBorderColor.js';
import {
	buildDeleteColumnTransaction,
	buildDeleteRowTransaction,
	buildInsertColumnTransaction,
	buildInsertRowTransaction,
	createDeleteTableTransaction,
} from './TableCommands.js';
import { type TableContextMenuHandle, createTableContextMenu } from './TableContextMenu.js';
import {
	TABLE_DELETE_SVG,
	buildActionsButton,
	buildAddButton,
	buildBorderColorButton,
	buildContextHint,
	buildHandle,
	buildHandleBar,
	buildInsertLine,
	createButton,
	updateBorderColorSwatch,
} from './TableControlsDOM.js';
import {
	BORDER_THRESHOLD,
	type BorderInfo,
	findNearestBorder,
	getTableOffset,
	measureColBorders,
	measureRowBorders,
	positionAddButtons,
	positionColHandles,
	positionRowHandles,
} from './TableControlsLayout.js';

// --- Types ---

export interface TableControlsHandle {
	update(node: BlockNode): void;
	destroy(): void;
}

// --- Class ---

class TableControls implements TableControlsHandle {
	private tableId: BlockId;
	private numRows: number;
	private numCols: number;
	private activeRowIndex = -1;
	private activeColIndex = -1;

	private readonly colBar: HTMLDivElement;
	private readonly rowBar: HTMLDivElement;
	private readonly insertLineH: HTMLDivElement;
	private readonly insertLineV: HTMLDivElement;
	private readonly addRowZone: HTMLButtonElement;
	private readonly addColZone: HTMLButtonElement;
	private readonly deleteTableBtn: HTMLButtonElement;
	private readonly borderColorBtn: HTMLButtonElement | null;
	private readonly actionsBtn: HTMLButtonElement | null;
	private readonly contextHint: HTMLDivElement;
	private readonly observer: ResizeObserver;
	private borderColorPopup: HTMLDivElement | null = null;
	private activeContextMenu: TableContextMenuHandle | null = null;

	private readonly container: HTMLElement;
	private readonly tableEl: HTMLTableElement;
	private readonly getState: () => EditorState;
	private readonly dispatchFn: (tr: Transaction) => void;
	private readonly pluginContext: PluginContext | null;

	private readonly onMouseMove = (e: MouseEvent): void => {
		const tableRect: DOMRect = this.tableEl.getBoundingClientRect();
		const x: number = e.clientX - tableRect.left;
		const y: number = e.clientY - tableRect.top;

		const inTable: boolean =
			x >= -BORDER_THRESHOLD &&
			x <= tableRect.width + BORDER_THRESHOLD &&
			y >= -BORDER_THRESHOLD &&
			y <= tableRect.height + BORDER_THRESHOLD;

		if (!inTable) {
			this.hideInsertLines();
			return;
		}

		const rowBorders: BorderInfo[] = measureRowBorders(this.tableEl);
		const colBorders: BorderInfo[] = measureColBorders(this.tableEl.offsetWidth, this.numCols);
		const result = findNearestBorder(x, y, rowBorders, colBorders);

		if (result.type === 'row' && result.border) {
			this.showHorizontalLine(result.border);
			this.hideVerticalLine();
		} else if (result.type === 'col' && result.border) {
			this.showVerticalLine(result.border);
			this.hideHorizontalLine();
		} else {
			this.hideInsertLines();
		}
	};

	private readonly onMouseLeave = (): void => {
		this.hideInsertLines();
	};

	constructor(
		container: HTMLElement,
		tableEl: HTMLTableElement,
		initialNode: BlockNode,
		getState: () => EditorState,
		dispatch: (tr: Transaction) => void,
		pluginContext?: PluginContext,
	) {
		this.container = container;
		this.tableEl = tableEl;
		this.getState = getState;
		this.dispatchFn = dispatch;
		this.pluginContext = pluginContext ?? null;

		this.tableId = initialNode.id;
		this.numRows = getBlockChildren(initialNode).length;
		this.numCols = this.countCols(initialNode);

		// Create DOM elements
		this.colBar = buildHandleBar('ntbl-col-bar');
		this.rowBar = buildHandleBar('ntbl-row-bar');
		this.insertLineH = buildInsertLine('horizontal');
		this.insertLineV = buildInsertLine('vertical');
		this.addRowZone = buildAddButton('ntbl-add-row', 'Add row');
		this.addColZone = buildAddButton('ntbl-add-col', 'Add column');
		this.deleteTableBtn = createButton('ntbl-delete-table-btn', TABLE_DELETE_SVG, 'Delete table');
		this.deleteTableBtn.setAttribute('data-notectl-no-print', '');

		// Border color button and actions button (only when plugin context available)
		if (pluginContext) {
			const currentColor: string | undefined = getTableBorderColor(getState(), this.tableId);
			this.borderColorBtn = buildBorderColorButton(currentColor);
			this.actionsBtn = buildActionsButton();
		} else {
			this.borderColorBtn = null;
			this.actionsBtn = null;
		}

		container.append(
			this.colBar,
			this.rowBar,
			this.insertLineH,
			this.insertLineV,
			this.addRowZone,
			this.addColZone,
			this.deleteTableBtn,
		);
		if (this.borderColorBtn) {
			container.appendChild(this.borderColorBtn);
		}
		if (this.actionsBtn) {
			container.appendChild(this.actionsBtn);
		}

		this.contextHint = buildContextHint();
		container.appendChild(this.contextHint);

		this.rebuildColHandles();
		this.rebuildRowHandles();
		this.bindEventListeners();

		this.observer = new ResizeObserver(() => {
			this.positionControls();
		});
		this.observer.observe(tableEl);
		requestAnimationFrame(() => this.positionControls());
	}

	update(node: BlockNode): void {
		this.tableId = node.id;
		const newRows: number = getBlockChildren(node).length;
		const newCols: number = this.countCols(node);

		if (newRows !== this.numRows || newCols !== this.numCols) {
			this.numRows = newRows;
			this.numCols = newCols;
			this.rebuildColHandles();
			this.rebuildRowHandles();
		}

		// Update border color swatch
		if (this.borderColorBtn) {
			const swatch = this.borderColorBtn.querySelector('.ntbl-border-color-swatch');
			if (swatch) {
				const color: string | undefined = node.attrs?.borderColor as string | undefined;
				updateBorderColorSwatch(swatch as HTMLElement, color);
			}
		}

		requestAnimationFrame(() => this.positionControls());
	}

	destroy(): void {
		this.activeContextMenu?.destroy();
		this.closeBorderColorPopup();
		this.observer.disconnect();
		this.container.removeEventListener('mousemove', this.onMouseMove);
		this.container.removeEventListener('mouseleave', this.onMouseLeave);
		this.colBar.remove();
		this.rowBar.remove();
		this.insertLineH.remove();
		this.insertLineV.remove();
		this.addRowZone.remove();
		this.addColZone.remove();
		this.deleteTableBtn.remove();
		this.borderColorBtn?.remove();
		this.actionsBtn?.remove();
		this.contextHint.remove();
	}

	private bindEventListeners(): void {
		const insertBtnH = this.insertLineH.querySelector('.ntbl-insert-btn') as HTMLButtonElement;
		const insertBtnV = this.insertLineV.querySelector('.ntbl-insert-btn') as HTMLButtonElement;

		insertBtnH.addEventListener('click', () => {
			if (this.activeRowIndex >= 0) {
				this.dispatchTransaction(
					buildInsertRowTransaction(this.getState(), this.tableId, this.activeRowIndex),
				);
			}
		});

		insertBtnV.addEventListener('click', () => {
			if (this.activeColIndex >= 0) {
				this.dispatchTransaction(
					buildInsertColumnTransaction(this.getState(), this.tableId, this.activeColIndex),
				);
			}
		});

		this.addRowZone.addEventListener('click', () => {
			this.dispatchTransaction(
				buildInsertRowTransaction(this.getState(), this.tableId, this.numRows),
			);
		});

		this.addColZone.addEventListener('click', () => {
			this.dispatchTransaction(
				buildInsertColumnTransaction(this.getState(), this.tableId, this.numCols),
			);
		});

		this.deleteTableBtn.addEventListener('click', () => {
			this.dispatchTransaction(createDeleteTableTransaction(this.getState(), this.tableId));
		});

		if (this.borderColorBtn && this.pluginContext) {
			const ctx = this.pluginContext;
			this.borderColorBtn.addEventListener('click', () => {
				this.toggleBorderColorPopup(ctx);
			});
		}

		if (this.actionsBtn && this.pluginContext) {
			const ctx = this.pluginContext;
			this.actionsBtn.addEventListener('click', () => {
				this.openActionsMenu(ctx);
			});
		}

		this.container.addEventListener('mousemove', this.onMouseMove);
		this.container.addEventListener('mouseleave', this.onMouseLeave);
	}

	private openActionsMenu(context: PluginContext): void {
		if (this.activeContextMenu?.isOpen()) {
			this.activeContextMenu.close();
			this.activeContextMenu = null;
			return;
		}

		if (!this.actionsBtn) return;

		const rect: DOMRect = this.actionsBtn.getBoundingClientRect();
		const anchorRect: DOMRect = new DOMRect(rect.left, rect.bottom + 4, 0, 0);

		this.activeContextMenu = createTableContextMenu(
			this.container,
			context,
			this.tableId,
			anchorRect,
			() => {
				this.activeContextMenu = null;
			},
		);
	}

	private toggleBorderColorPopup(context: PluginContext): void {
		if (this.borderColorPopup) {
			this.closeBorderColorPopup();
			return;
		}

		this.borderColorPopup = document.createElement('div');
		this.borderColorPopup.className = 'notectl-table-context-menu';
		this.borderColorPopup.style.position = 'absolute';
		this.borderColorPopup.style.top = '24px';
		this.borderColorPopup.style.left = '24px';
		this.borderColorPopup.style.zIndex = '10000';
		this.borderColorPopup.setAttribute('contenteditable', 'false');

		renderBorderColorPicker(this.borderColorPopup, context, this.tableId, () => {
			this.closeBorderColorPopup();
		});

		this.container.appendChild(this.borderColorPopup);
	}

	private closeBorderColorPopup(): void {
		if (this.borderColorPopup) {
			this.borderColorPopup.remove();
			this.borderColorPopup = null;
		}
	}

	private dispatchTransaction(tr: Transaction | null): void {
		if (tr) this.dispatchFn(tr);
	}

	private countCols(node: BlockNode): number {
		const rows = getBlockChildren(node);
		return rows[0] ? getBlockChildren(rows[0]).length : 0;
	}

	private positionControls(): void {
		positionColHandles(this.colBar, this.tableEl.offsetWidth, this.numCols);
		positionRowHandles(this.rowBar, this.tableEl);
		positionAddButtons(this.addRowZone, this.addColZone, this.tableEl, this.container);
	}

	private showHorizontalLine(border: BorderInfo): void {
		this.activeRowIndex = border.index;
		const offset = getTableOffset(this.tableEl, this.container);
		this.insertLineH.style.top = `${offset.top + border.position - 1}px`;
		this.insertLineH.style.left = `${offset.left}px`;
		this.insertLineH.style.width = `${this.tableEl.offsetWidth}px`;
		this.insertLineH.classList.add('ntbl-insert-line--visible');
	}

	private showVerticalLine(border: BorderInfo): void {
		this.activeColIndex = border.index;
		const offset = getTableOffset(this.tableEl, this.container);
		this.insertLineV.style.left = `${offset.left + border.position - 1}px`;
		this.insertLineV.style.top = `${offset.top}px`;
		this.insertLineV.style.height = `${this.tableEl.offsetHeight}px`;
		this.insertLineV.classList.add('ntbl-insert-line--visible');
	}

	private hideInsertLines(): void {
		this.hideHorizontalLine();
		this.hideVerticalLine();
	}

	private hideHorizontalLine(): void {
		this.insertLineH.classList.remove('ntbl-insert-line--visible');
		this.activeRowIndex = -1;
	}

	private hideVerticalLine(): void {
		this.insertLineV.classList.remove('ntbl-insert-line--visible');
		this.activeColIndex = -1;
	}

	private rebuildColHandles(): void {
		this.colBar.innerHTML = '';
		for (let i = 0; i < this.numCols; i++) {
			const handle: HTMLDivElement = buildHandle(
				'ntbl-col-handle',
				i,
				'Delete column',
				(idx: number) => {
					this.dispatchTransaction(
						buildDeleteColumnTransaction(this.getState(), this.tableId, idx),
					);
				},
			);
			this.colBar.appendChild(handle);
		}
	}

	private rebuildRowHandles(): void {
		this.rowBar.innerHTML = '';
		for (let i = 0; i < this.numRows; i++) {
			const handle: HTMLDivElement = buildHandle(
				'ntbl-row-handle',
				i,
				'Delete row',
				(idx: number) => {
					this.dispatchTransaction(buildDeleteRowTransaction(this.getState(), this.tableId, idx));
				},
			);
			this.rowBar.appendChild(handle);
		}
	}
}

// --- Factory ---

/** Creates table controls for the given table element. */
export function createTableControls(
	container: HTMLElement,
	tableEl: HTMLTableElement,
	initialNode: BlockNode,
	getState: () => EditorState,
	dispatch: (tr: Transaction) => void,
	pluginContext?: PluginContext,
): TableControlsHandle {
	return new TableControls(container, tableEl, initialNode, getState, dispatch, pluginContext);
}
