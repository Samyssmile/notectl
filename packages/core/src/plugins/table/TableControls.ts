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
import {
	buildDeleteColumnTransaction,
	buildDeleteRowTransaction,
	buildInsertColumnTransaction,
	buildInsertRowTransaction,
	createDeleteTableTransaction,
} from './TableCommands.js';
import {
	TABLE_DELETE_SVG,
	buildAddButton,
	buildHandle,
	buildHandleBar,
	buildInsertLine,
	createButton,
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
	private readonly observer: ResizeObserver;

	private readonly container: HTMLElement;
	private readonly tableEl: HTMLTableElement;
	private readonly getState: () => EditorState;
	private readonly dispatchFn: (tr: Transaction) => void;

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
	) {
		this.container = container;
		this.tableEl = tableEl;
		this.getState = getState;
		this.dispatchFn = dispatch;

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

		container.append(
			this.colBar,
			this.rowBar,
			this.insertLineH,
			this.insertLineV,
			this.addRowZone,
			this.addColZone,
			this.deleteTableBtn,
		);

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

		requestAnimationFrame(() => this.positionControls());
	}

	destroy(): void {
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

		this.container.addEventListener('mousemove', this.onMouseMove);
		this.container.addEventListener('mouseleave', this.onMouseLeave);
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
): TableControlsHandle {
	return new TableControls(container, tableEl, initialNode, getState, dispatch);
}
