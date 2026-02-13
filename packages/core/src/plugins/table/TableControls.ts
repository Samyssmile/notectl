/**
 * Interactive table controls: floating insert lines between borders,
 * add row/column buttons at edges, and column/row handles with delete.
 * All controls appear on hover with smooth CSS animations.
 */

import type { BlockNode } from '../../model/Document.js';
import { getBlockChildren } from '../../model/Document.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { createDeleteTableTransaction } from './TableCommands.js';
import { createTableCell, createTableRow, getCellAt } from './TableHelpers.js';

// --- SVG Icons ---

const PLUS_SVG: string =
	'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" ' +
	'viewBox="0 0 12 12" fill="none">' +
	'<path d="M6 1v10M1 6h10" stroke="currentColor" ' +
	'stroke-width="1.8" stroke-linecap="round"/></svg>';

const DELETE_SVG: string =
	'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" ' +
	'viewBox="0 0 10 10" fill="none">' +
	'<path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" ' +
	'stroke-width="1.5" stroke-linecap="round"/></svg>';

const TABLE_DELETE_SVG: string =
	'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" ' +
	'viewBox="0 0 24 24" fill="none">' +
	'<path d="M9 3h6m-9 4h12M10 11v6m4-6v6m-9 3h14l-1-13H6L5 20z" ' +
	'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
	'stroke-linejoin="round"/></svg>';

// --- Constants ---

const BORDER_THRESHOLD: number = 10;

// --- Types ---

export interface TableControlsHandle {
	update(node: BlockNode): void;
	destroy(): void;
}

interface BorderInfo {
	readonly position: number;
	readonly index: number;
}

// --- Transaction Helpers ---

function insertRowAtIndex(
	getState: () => EditorState,
	dispatch: (tr: Transaction) => void,
	tableId: BlockId,
	rowIndex: number,
): void {
	const state: EditorState = getState();
	const table: BlockNode | undefined = state.getBlock(tableId);
	if (!table) return;

	const rows: readonly BlockNode[] = getBlockChildren(table);
	const numCols: number = rows[0] ? getBlockChildren(rows[0]).length : 0;
	if (numCols === 0) return;

	const newRow: BlockNode = createTableRow(numCols);
	const firstCell: BlockNode | undefined = getBlockChildren(newRow)[0];

	const tr = state.transaction('command').insertNode([tableId], rowIndex, newRow);

	if (firstCell) {
		tr.setSelection(createCollapsedSelection(firstCell.id, 0));
	}

	dispatch(tr.build());
}

function insertColumnAtIndex(
	getState: () => EditorState,
	dispatch: (tr: Transaction) => void,
	tableId: BlockId,
	colIndex: number,
): void {
	const state: EditorState = getState();
	const table: BlockNode | undefined = state.getBlock(tableId);
	if (!table) return;

	const rows: readonly BlockNode[] = getBlockChildren(table);
	const tr = state.transaction('command');

	for (const row of rows) {
		const newCell: BlockNode = createTableCell();
		tr.insertNode([tableId, row.id], colIndex, newCell);
	}

	tr.setSelection(state.selection);
	dispatch(tr.build());
}

function deleteRowAtIndex(
	getState: () => EditorState,
	dispatch: (tr: Transaction) => void,
	tableId: BlockId,
	rowIndex: number,
): void {
	const state: EditorState = getState();
	const table: BlockNode | undefined = state.getBlock(tableId);
	if (!table) return;

	const rows: readonly BlockNode[] = getBlockChildren(table);
	if (rows.length <= 1) {
		deleteTableAtRoot(getState, dispatch, tableId);
		return;
	}

	const tr = state.transaction('command').removeNode([tableId], rowIndex);

	const targetRow: number = rowIndex > 0 ? rowIndex - 1 : 1;
	const cellId: BlockId | null = getCellAt(state, tableId, targetRow, 0);
	if (cellId) {
		tr.setSelection(createCollapsedSelection(cellId, 0));
	}

	dispatch(tr.build());
}

function deleteColumnAtIndex(
	getState: () => EditorState,
	dispatch: (tr: Transaction) => void,
	tableId: BlockId,
	colIndex: number,
): void {
	const state: EditorState = getState();
	const table: BlockNode | undefined = state.getBlock(tableId);
	if (!table) return;

	const rows: readonly BlockNode[] = getBlockChildren(table);
	const numCols: number = rows[0] ? getBlockChildren(rows[0]).length : 0;

	if (numCols <= 1) {
		deleteTableAtRoot(getState, dispatch, tableId);
		return;
	}

	const tr = state.transaction('command');

	for (let r: number = rows.length - 1; r >= 0; r--) {
		const row: BlockNode | undefined = rows[r];
		if (!row) continue;
		tr.removeNode([tableId, row.id], colIndex);
	}

	const targetCol: number = colIndex > 0 ? colIndex - 1 : 1;
	const cellId: BlockId | null = getCellAt(state, tableId, 0, targetCol);
	if (cellId) {
		tr.setSelection(createCollapsedSelection(cellId, 0));
	}

	dispatch(tr.build());
}

function deleteTableAtRoot(
	getState: () => EditorState,
	dispatch: (tr: Transaction) => void,
	tableId: BlockId,
): void {
	const tr = createDeleteTableTransaction(getState(), tableId);
	if (!tr) return;
	dispatch(tr);
}

// --- DOM Builders ---

function createButton(className: string, innerHTML: string, title: string): HTMLButtonElement {
	const btn: HTMLButtonElement = document.createElement('button');
	btn.className = className;
	btn.innerHTML = innerHTML;
	btn.title = title;
	btn.type = 'button';
	btn.setAttribute('contenteditable', 'false');
	btn.addEventListener('mousedown', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
	});
	return btn;
}

function buildInsertLine(orientation: 'horizontal' | 'vertical'): HTMLDivElement {
	const line: HTMLDivElement = document.createElement('div');
	line.className = `ntbl-insert-line ntbl-insert-line--${orientation}`;
	line.setAttribute('contenteditable', 'false');

	const title: string = orientation === 'horizontal' ? 'Insert row' : 'Insert column';
	const btn: HTMLButtonElement = createButton('ntbl-insert-btn', PLUS_SVG, title);
	line.appendChild(btn);

	return line;
}

function buildAddButton(className: string, title: string): HTMLDivElement {
	const container: HTMLDivElement = document.createElement('div');
	container.className = `ntbl-add-zone ${className}`;
	container.setAttribute('contenteditable', 'false');
	container.title = title;

	const icon: HTMLSpanElement = document.createElement('span');
	icon.className = 'ntbl-add-icon';
	icon.innerHTML = PLUS_SVG;
	container.appendChild(icon);

	container.addEventListener('mousedown', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
	});

	return container;
}

function buildHandleBar(className: string): HTMLDivElement {
	const bar: HTMLDivElement = document.createElement('div');
	bar.className = className;
	bar.setAttribute('contenteditable', 'false');
	return bar;
}

function buildHandle(
	className: string,
	index: number,
	onDelete: (idx: number) => void,
): HTMLDivElement {
	const handle: HTMLDivElement = document.createElement('div');
	handle.className = `ntbl-handle ${className}`;
	handle.dataset.index = String(index);

	const deleteBtn: HTMLButtonElement = createButton(
		'ntbl-handle-delete',
		DELETE_SVG,
		className.includes('col') ? 'Delete column' : 'Delete row',
	);
	deleteBtn.addEventListener('click', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		onDelete(index);
	});
	handle.appendChild(deleteBtn);

	return handle;
}

// --- Main Factory ---

export function createTableControls(
	container: HTMLElement,
	tableEl: HTMLTableElement,
	initialNode: BlockNode,
	getState: () => EditorState,
	dispatch: (tr: Transaction) => void,
): TableControlsHandle {
	let tableId: BlockId = initialNode.id;
	let numRows: number = countRows(initialNode);
	let numCols: number = countCols(initialNode);

	// --- Create DOM elements ---

	const colBar: HTMLDivElement = buildHandleBar('ntbl-col-bar');
	const rowBar: HTMLDivElement = buildHandleBar('ntbl-row-bar');
	const insertLineH: HTMLDivElement = buildInsertLine('horizontal');
	const insertLineV: HTMLDivElement = buildInsertLine('vertical');
	const addRowZone: HTMLDivElement = buildAddButton('ntbl-add-row', 'Add row');
	const addColZone: HTMLDivElement = buildAddButton('ntbl-add-col', 'Add column');
	const deleteTableBtn: HTMLButtonElement = createButton(
		'ntbl-delete-table-btn',
		TABLE_DELETE_SVG,
		'Delete table',
	);

	// --- Insert line state ---

	let activeRowIndex = -1;
	let activeColIndex = -1;

	// --- Append to container ---

	container.append(
		colBar,
		rowBar,
		insertLineH,
		insertLineV,
		addRowZone,
		addColZone,
		deleteTableBtn,
	);

	// --- Build handles ---

	rebuildColHandles();
	rebuildRowHandles();

	// --- Event handlers ---

	const insertBtnH: HTMLButtonElement = insertLineH.querySelector(
		'.ntbl-insert-btn',
	) as HTMLButtonElement;
	const insertBtnV: HTMLButtonElement = insertLineV.querySelector(
		'.ntbl-insert-btn',
	) as HTMLButtonElement;

	insertBtnH.addEventListener('click', () => {
		if (activeRowIndex >= 0) {
			insertRowAtIndex(getState, dispatch, tableId, activeRowIndex);
		}
	});

	insertBtnV.addEventListener('click', () => {
		if (activeColIndex >= 0) {
			insertColumnAtIndex(getState, dispatch, tableId, activeColIndex);
		}
	});

	addRowZone.addEventListener('click', () => {
		insertRowAtIndex(getState, dispatch, tableId, numRows);
	});

	addColZone.addEventListener('click', () => {
		insertColumnAtIndex(getState, dispatch, tableId, numCols);
	});

	deleteTableBtn.addEventListener('click', () => {
		deleteTableAtRoot(getState, dispatch, tableId);
	});

	container.addEventListener('mousemove', onMouseMove);
	container.addEventListener('mouseleave', onMouseLeave);

	// --- Positioning ---

	const observer: ResizeObserver = new ResizeObserver(() => {
		positionControls();
	});
	observer.observe(tableEl);
	requestAnimationFrame(() => positionControls());

	// --- Functions ---

	function countRows(node: BlockNode): number {
		return getBlockChildren(node).length;
	}

	function countCols(node: BlockNode): number {
		const rows: readonly BlockNode[] = getBlockChildren(node);
		return rows[0] ? getBlockChildren(rows[0]).length : 0;
	}

	/** Returns the table's offset relative to the container (walks offsetParent chain). */
	function getTableOffset(): { top: number; left: number } {
		let top = 0;
		let left = 0;
		let el: HTMLElement | null = tableEl;
		while (el && el !== container) {
			top += el.offsetTop;
			left += el.offsetLeft;
			el = el.offsetParent as HTMLElement | null;
		}
		return { top, left };
	}

	function measureRowBorders(): BorderInfo[] {
		const trs: NodeListOf<HTMLTableRowElement> = tableEl.querySelectorAll(':scope > tbody > tr');
		const tableTop: number = tableEl.offsetTop;
		const borders: BorderInfo[] = [];

		for (let i = 1; i < trs.length; i++) {
			const tr: HTMLTableRowElement | undefined = trs[i];
			if (!tr) continue;
			borders.push({
				position: tr.offsetTop - tableTop,
				index: i,
			});
		}

		return borders;
	}

	function measureColBorders(): BorderInfo[] {
		if (numCols <= 1) return [];
		const tableWidth: number = tableEl.offsetWidth;
		const colWidth: number = tableWidth / numCols;
		const borders: BorderInfo[] = [];

		for (let i = 1; i < numCols; i++) {
			borders.push({
				position: Math.round(colWidth * i),
				index: i,
			});
		}

		return borders;
	}

	function positionControls(): void {
		positionColHandles();
		positionRowHandles();
		positionAddButtons();
	}

	function positionColHandles(): void {
		const handles: HTMLCollection = colBar.children;
		if (handles.length === 0) return;

		const tableWidth: number = tableEl.offsetWidth;
		const colWidth: number = tableWidth / numCols;

		for (let i = 0; i < handles.length; i++) {
			const h = handles[i] as HTMLElement;
			h.style.left = `${Math.round(colWidth * i)}px`;
			h.style.width = `${Math.round(colWidth)}px`;
		}

		colBar.style.width = `${tableWidth}px`;
	}

	function positionRowHandles(): void {
		const handles: HTMLCollection = rowBar.children;
		if (handles.length === 0) return;

		const trs: NodeListOf<HTMLTableRowElement> = tableEl.querySelectorAll(':scope > tbody > tr');

		const tableTop: number = tableEl.offsetTop;
		let totalHeight = 0;

		for (let i = 0; i < handles.length; i++) {
			const h = handles[i] as HTMLElement;
			const tr: HTMLTableRowElement | undefined = trs[i];
			if (tr) {
				const top: number = tr.offsetTop - tableTop;
				const height: number = tr.offsetHeight;
				h.style.top = `${top}px`;
				h.style.height = `${height}px`;
				totalHeight = top + height;
			}
		}

		rowBar.style.height = `${totalHeight}px`;
	}

	function positionAddButtons(): void {
		const offset = getTableOffset();
		const tableHeight: number = tableEl.offsetHeight;
		const tableWidth: number = tableEl.offsetWidth;

		addRowZone.style.width = `${tableWidth}px`;
		addRowZone.style.left = `${offset.left}px`;

		addColZone.style.height = `${tableHeight}px`;
		addColZone.style.top = `${offset.top}px`;
	}

	function onMouseMove(e: MouseEvent): void {
		const tableRect: DOMRect = tableEl.getBoundingClientRect();
		const x: number = e.clientX - tableRect.left;
		const y: number = e.clientY - tableRect.top;

		// Check if mouse is inside table bounds (with margin)
		const inTable: boolean =
			x >= -BORDER_THRESHOLD &&
			x <= tableRect.width + BORDER_THRESHOLD &&
			y >= -BORDER_THRESHOLD &&
			y <= tableRect.height + BORDER_THRESHOLD;

		if (!inTable) {
			hideInsertLines();
			return;
		}

		// Find nearest row border
		const rowBorders: BorderInfo[] = measureRowBorders();
		let nearestRowDist: number = Number.POSITIVE_INFINITY;
		let nearestRowBorder: BorderInfo | null = null;

		for (const border of rowBorders) {
			const dist: number = Math.abs(y - border.position);
			if (dist < nearestRowDist && dist < BORDER_THRESHOLD) {
				nearestRowDist = dist;
				nearestRowBorder = border;
			}
		}

		// Find nearest column border
		const colBorders: BorderInfo[] = measureColBorders();
		let nearestColDist: number = Number.POSITIVE_INFINITY;
		let nearestColBorder: BorderInfo | null = null;

		for (const border of colBorders) {
			const dist: number = Math.abs(x - border.position);
			if (dist < nearestColDist && dist < BORDER_THRESHOLD) {
				nearestColDist = dist;
				nearestColBorder = border;
			}
		}

		// Show the nearest line (prefer the closer one)
		if (nearestRowBorder && (!nearestColBorder || nearestRowDist <= nearestColDist)) {
			showHorizontalLine(nearestRowBorder);
			hideVerticalLine();
		} else if (nearestColBorder) {
			showVerticalLine(nearestColBorder);
			hideHorizontalLine();
		} else {
			hideInsertLines();
		}
	}

	function onMouseLeave(): void {
		hideInsertLines();
	}

	function showHorizontalLine(border: BorderInfo): void {
		activeRowIndex = border.index;
		const offset = getTableOffset();
		insertLineH.style.top = `${offset.top + border.position - 1}px`;
		insertLineH.style.left = `${offset.left}px`;
		insertLineH.style.width = `${tableEl.offsetWidth}px`;
		insertLineH.classList.add('ntbl-insert-line--visible');
	}

	function showVerticalLine(border: BorderInfo): void {
		activeColIndex = border.index;
		const offset = getTableOffset();
		insertLineV.style.left = `${offset.left + border.position - 1}px`;
		insertLineV.style.top = `${offset.top}px`;
		insertLineV.style.height = `${tableEl.offsetHeight}px`;
		insertLineV.classList.add('ntbl-insert-line--visible');
	}

	function hideInsertLines(): void {
		hideHorizontalLine();
		hideVerticalLine();
	}

	function hideHorizontalLine(): void {
		insertLineH.classList.remove('ntbl-insert-line--visible');
		activeRowIndex = -1;
	}

	function hideVerticalLine(): void {
		insertLineV.classList.remove('ntbl-insert-line--visible');
		activeColIndex = -1;
	}

	function rebuildColHandles(): void {
		colBar.innerHTML = '';
		for (let i = 0; i < numCols; i++) {
			const handle: HTMLDivElement = buildHandle('ntbl-col-handle', i, (idx: number) => {
				deleteColumnAtIndex(getState, dispatch, tableId, idx);
			});
			colBar.appendChild(handle);
		}
	}

	function rebuildRowHandles(): void {
		rowBar.innerHTML = '';
		for (let i = 0; i < numRows; i++) {
			const handle: HTMLDivElement = buildHandle('ntbl-row-handle', i, (idx: number) => {
				deleteRowAtIndex(getState, dispatch, tableId, idx);
			});
			rowBar.appendChild(handle);
		}
	}

	// --- Public API ---

	return {
		update(node: BlockNode): void {
			tableId = node.id;
			const newRows: number = countRows(node);
			const newCols: number = countCols(node);

			if (newRows !== numRows || newCols !== numCols) {
				numRows = newRows;
				numCols = newCols;
				rebuildColHandles();
				rebuildRowHandles();
			}

			requestAnimationFrame(() => positionControls());
		},

		destroy(): void {
			observer.disconnect();
			container.removeEventListener('mousemove', onMouseMove);
			container.removeEventListener('mouseleave', onMouseLeave);
			colBar.remove();
			rowBar.remove();
			insertLineH.remove();
			insertLineV.remove();
			addRowZone.remove();
			addColZone.remove();
			deleteTableBtn.remove();
		},
	};
}
