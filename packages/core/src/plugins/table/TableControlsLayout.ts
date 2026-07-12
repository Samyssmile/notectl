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

export interface ColumnBox {
	readonly index: number;
	readonly position: number;
	readonly width: number;
}

// --- Constants ---

export const BORDER_THRESHOLD: number = 10;

// --- Offset ---

/** Returns the rendered table offset relative to the control container. */
export function getTableOffset(
	tableEl: HTMLElement,
	container: HTMLElement,
): { top: number; left: number } {
	const tableRect: DOMRect = tableEl.getBoundingClientRect();
	const containerRect: DOMRect = container.getBoundingClientRect();
	return {
		top: tableRect.top - containerRect.top + container.scrollTop,
		left: tableRect.left - containerRect.left + container.scrollLeft,
	};
}

// --- Border Measurement ---

/** Measures the Y-positions of inter-row borders (between adjacent <tr> elements). */
export function measureRowBorders(tableEl: HTMLTableElement): BorderInfo[] {
	const trs: NodeListOf<HTMLTableRowElement> = tableEl.querySelectorAll(':scope > tbody > tr');
	const tableTop: number = tableEl.getBoundingClientRect().top;
	const borders: BorderInfo[] = [];

	for (let i = 1; i < trs.length; i++) {
		const tr: HTMLTableRowElement | undefined = trs[i];
		if (!tr) continue;
		borders.push({
			position: Math.round(tr.getBoundingClientRect().top - tableTop),
			index: i,
		});
	}

	return borders;
}

/** Measures rendered logical column boxes, with an equal-width fallback for incomplete DOMs. */
export function measureColumnBoxes(tableEl: HTMLTableElement, fallbackCount = 0): ColumnBox[] {
	const tableRect: DOMRect = tableEl.getBoundingClientRect();
	const columns: readonly HTMLTableColElement[] = Array.from(
		tableEl.querySelectorAll(':scope > colgroup > col'),
	);
	if (columns.length > 0) {
		const measured: ColumnBox[] = columns.map((column, index) => {
			const rect: DOMRect = column.getBoundingClientRect();
			return {
				index,
				position: rect.left - tableRect.left,
				width: rect.width,
			};
		});
		if (measured.every((box) => box.width > 0)) return measured;
	}

	const count: number = columns.length || fallbackCount;
	const tableWidth: number = tableRect.width || tableEl.offsetWidth;
	if (count <= 0 || tableWidth <= 0) return [];
	const width: number = tableWidth / count;
	return Array.from({ length: count }, (_value, index) => ({
		index,
		position: width * index,
		width,
	}));
}

/** Measures inter-column boundaries from rendered `<col>` geometry. */
export function measureColBorders(tableEl: HTMLTableElement, fallbackCount?: number): BorderInfo[];
/** @deprecated Numeric overload retained for compatibility with existing integrations. */
export function measureColBorders(tableWidth: number, numCols: number): BorderInfo[];
export function measureColBorders(
	tableOrWidth: HTMLTableElement | number,
	count = 0,
): BorderInfo[] {
	if (typeof tableOrWidth === 'number') {
		if (count <= 1) return [];
		const width: number = tableOrWidth / count;
		return Array.from({ length: count - 1 }, (_value, index) => ({
			position: Math.round(width * (index + 1)),
			index: index + 1,
		}));
	}

	const boxes: readonly ColumnBox[] = measureColumnBoxes(tableOrWidth, count);
	if (boxes.length <= 1) return [];
	const rtl: boolean = getComputedStyle(tableOrWidth).direction === 'rtl';
	return boxes.slice(0, -1).map((box, index) => ({
		position: Math.round(rtl ? box.position : box.position + box.width),
		index: index + 1,
	}));
}

// --- Positioning ---

/** Positions column handles evenly across the table width. */
export function positionColHandles(
	colBar: HTMLDivElement,
	tableOrWidth: HTMLTableElement | number,
	numCols = 0,
): void {
	const handles: HTMLCollection = colBar.children;
	if (handles.length === 0) return;

	const boxes: readonly ColumnBox[] =
		typeof tableOrWidth === 'number'
			? Array.from({ length: numCols }, (_value, index) => ({
					index,
					position: (tableOrWidth / numCols) * index,
					width: tableOrWidth / numCols,
				}))
			: measureColumnBoxes(tableOrWidth, numCols);

	for (let i = 0; i < handles.length; i++) {
		const h = handles[i] as HTMLElement;
		const box: ColumnBox | undefined = boxes[i];
		if (!box) continue;
		setStyleProperties(h, {
			left: `${Math.round(box.position)}px`,
			width: `${Math.round(box.width)}px`,
		});
	}

	const totalWidth: number = boxes.reduce(
		(maximum, box) => Math.max(maximum, box.position + box.width),
		0,
	);
	setStyleProperty(colBar, 'width', `${Math.round(totalWidth)}px`);
}

/** Positions row handles to match actual <tr> offsets and heights. */
export function positionRowHandles(rowBar: HTMLDivElement, tableEl: HTMLTableElement): void {
	const handles: HTMLCollection = rowBar.children;
	if (handles.length === 0) return;

	const trs: NodeListOf<HTMLTableRowElement> = tableEl.querySelectorAll(':scope > tbody > tr');
	const tableRect: DOMRect = tableEl.getBoundingClientRect();
	let totalHeight = 0;

	for (let i = 0; i < handles.length; i++) {
		const h = handles[i] as HTMLElement;
		const tr: HTMLTableRowElement | undefined = trs[i];
		if (tr) {
			const rect: DOMRect = tr.getBoundingClientRect();
			const top: number = rect.top - tableRect.top;
			const height: number = rect.height || tr.offsetHeight;
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
	const tableRect: DOMRect = tableEl.getBoundingClientRect();
	const tableHeight: number = tableRect.height || tableEl.offsetHeight;
	const tableWidth: number = tableRect.width || tableEl.offsetWidth;

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
