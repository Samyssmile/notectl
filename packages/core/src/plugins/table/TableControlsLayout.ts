/**
 * Measurement and positioning logic for table controls.
 * All functions are pure (take numeric/DOM inputs, return structured results).
 */

import { setStyleProperties, setStyleProperty } from '../../style/StyleRuntime.js';

// --- Types ---

export interface BorderInfo {
	readonly position: number;
	readonly index: number;
}

export interface NearestBorderResult {
	readonly type: 'row' | 'col' | 'none';
	readonly border: BorderInfo | null;
}

// --- Constants ---

export const BORDER_THRESHOLD: number = 10;

// --- Offset ---

/** Returns the table's offset relative to the container (walks offsetParent chain). */
export function getTableOffset(
	tableEl: HTMLElement,
	container: HTMLElement,
): { top: number; left: number } {
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

// --- Border Measurement ---

/** Measures the Y-positions of inter-row borders (between adjacent <tr> elements). */
export function measureRowBorders(tableEl: HTMLTableElement): BorderInfo[] {
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

/** Measures the X-positions of inter-column borders (evenly spaced). */
export function measureColBorders(tableWidth: number, numCols: number): BorderInfo[] {
	if (numCols <= 1) return [];

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

// --- Positioning ---

/** Positions column handles evenly across the table width. */
export function positionColHandles(
	colBar: HTMLDivElement,
	tableWidth: number,
	numCols: number,
): void {
	const handles: HTMLCollection = colBar.children;
	if (handles.length === 0) return;

	const colWidth: number = tableWidth / numCols;

	for (let i = 0; i < handles.length; i++) {
		const h = handles[i] as HTMLElement;
		setStyleProperties(h, {
			left: `${Math.round(colWidth * i)}px`,
			width: `${Math.round(colWidth)}px`,
		});
	}

	setStyleProperty(colBar, 'width', `${tableWidth}px`);
}

/** Positions row handles to match actual <tr> offsets and heights. */
export function positionRowHandles(rowBar: HTMLDivElement, tableEl: HTMLTableElement): void {
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
			setStyleProperties(h, {
				top: `${top}px`,
				height: `${height}px`,
			});
			totalHeight = top + height;
		}
	}

	setStyleProperty(rowBar, 'height', `${totalHeight}px`);
}

/** Positions add-row and add-column buttons at the table edges. */
export function positionAddButtons(
	addRowZone: HTMLElement,
	addColZone: HTMLElement,
	tableEl: HTMLElement,
	container: HTMLElement,
): void {
	const offset = getTableOffset(tableEl, container);
	const tableHeight: number = tableEl.offsetHeight;
	const tableWidth: number = tableEl.offsetWidth;

	setStyleProperties(addRowZone, {
		width: `${tableWidth}px`,
		left: `${offset.left}px`,
	});

	setStyleProperties(addColZone, {
		height: `${tableHeight}px`,
		top: `${offset.top}px`,
	});
}

// --- Border Detection ---

/**
 * Finds the nearest row or column border to the given mouse position.
 * Returns which border is closest (within threshold), preferring the nearer one.
 */
export function findNearestBorder(
	x: number,
	y: number,
	rowBorders: readonly BorderInfo[],
	colBorders: readonly BorderInfo[],
): NearestBorderResult {
	let nearestRowDist: number = Number.POSITIVE_INFINITY;
	let nearestRowBorder: BorderInfo | null = null;

	for (const border of rowBorders) {
		const dist: number = Math.abs(y - border.position);
		if (dist < nearestRowDist && dist < BORDER_THRESHOLD) {
			nearestRowDist = dist;
			nearestRowBorder = border;
		}
	}

	let nearestColDist: number = Number.POSITIVE_INFINITY;
	let nearestColBorder: BorderInfo | null = null;

	for (const border of colBorders) {
		const dist: number = Math.abs(x - border.position);
		if (dist < nearestColDist && dist < BORDER_THRESHOLD) {
			nearestColDist = dist;
			nearestColBorder = border;
		}
	}

	if (nearestRowBorder && (!nearestColBorder || nearestRowDist <= nearestColDist)) {
		return { type: 'row', border: nearestRowBorder };
	}

	if (nearestColBorder) {
		return { type: 'col', border: nearestColBorder };
	}

	return { type: 'none', border: null };
}
