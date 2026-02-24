/**
 * Border color commands, transaction builder, and accessible color picker
 * for table borders. Supports theme-default, custom hex, and borderless modes.
 */

import type { BlockAttrs } from '../../model/Document.js';
import { isNodeSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { getColorName, isLightColor } from '../shared/ColorNames.js';
import { navigateGrid } from '../toolbar/ToolbarKeyboardNav.js';
import { findTableContext } from './TableHelpers.js';
import { TABLE_LOCALE_EN, type TableLocale } from './TableLocale.js';

// --- Border Color Palette ---

/** Subdued, border-appropriate colors: grays, earth tones, muted hues. */
export const BORDER_COLOR_PALETTE: readonly string[] = [
	'#000000',
	'#434343',
	'#666666',
	'#999999',
	'#b7b7b7',
	'#cccccc',
	'#d9d9d9',
	'#efefef',
	'#980000',
	'#cc0000',
	'#e69138',
	'#f1c232',
	'#6aa84f',
	'#45818e',
	'#3c78d8',
	'#3d85c6',
	'#674ea7',
	'#a64d79',
	'#0b5394',
	'#38761d',
];

const COLUMNS = 5;
const GRID_NAV_KEYS: ReadonlySet<string> = new Set([
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
]);

// --- Transaction Builder ---

/**
 * Builds a transaction that sets `borderColor` on a table node.
 * Preserves existing attributes (spread pattern).
 */
export function buildSetBorderColorTransaction(
	state: EditorState,
	tableId: BlockId,
	borderColor: string | undefined,
): Transaction | null {
	const table = state.getBlock(tableId);
	if (!table || table.type !== 'table') return null;

	const path = state.getNodePath(tableId);
	if (!path) return null;

	if (borderColor === undefined) {
		// Remove borderColor from attrs, keep everything else
		const { borderColor: _, ...rest } = (table.attrs ?? {}) as Record<
			string,
			string | number | boolean
		>;
		const cleaned: BlockAttrs = rest;
		return state
			.transaction('command')
			.setNodeAttr(path, cleaned)
			.setSelection(state.selection)
			.build();
	}

	const newAttrs: BlockAttrs = { ...table.attrs, borderColor };
	return state
		.transaction('command')
		.setNodeAttr(path, newAttrs)
		.setSelection(state.selection)
		.build();
}

// --- Commands ---

/** Sets the border color on the table surrounding the cursor. */
export function setTableBorderColor(
	context: PluginContext,
	color: string,
	locale: TableLocale = TABLE_LOCALE_EN,
): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	const tr = buildSetBorderColorTransaction(state, tableCtx.tableId, color);
	if (!tr) return false;

	context.dispatch(tr);
	const colorName: string = color === 'none' ? 'none' : getColorName(color);
	context.announce(locale.announceBorderColorSet(colorName));
	return true;
}

/** Resets the border color to theme default. */
export function resetTableBorderColor(
	context: PluginContext,
	locale: TableLocale = TABLE_LOCALE_EN,
): boolean {
	const state = context.getState();
	if (isNodeSelection(state.selection)) return false;
	const tableCtx = findTableContext(state, state.selection.anchor.blockId);
	if (!tableCtx) return false;

	const tr = buildSetBorderColorTransaction(state, tableCtx.tableId, undefined);
	if (!tr) return false;

	context.dispatch(tr);
	context.announce(locale.announceBorderReset);
	return true;
}

/** Reads the current border color from a table node. */
export function getTableBorderColor(state: EditorState, tableId: BlockId): string | undefined {
	const table = state.getBlock(tableId);
	if (!table) return undefined;
	return table.attrs?.borderColor as string | undefined;
}

// --- Border Color Picker ---

/**
 * Renders an accessible border color picker into a container element.
 * Includes "Default", "No borders", and a WAI-ARIA grid of color swatches.
 */
export function renderBorderColorPicker(
	container: HTMLElement,
	context: PluginContext,
	tableId: BlockId,
	onClose: () => void,
	locale: TableLocale = TABLE_LOCALE_EN,
): void {
	container.classList.add('notectl-color-picker');

	const currentColor: string | undefined = getTableBorderColor(context.getState(), tableId);
	const totalSwatches: number = BORDER_COLOR_PALETTE.length;
	const totalRows: number = Math.ceil(totalSwatches / COLUMNS);

	// --- Default button ---
	const defaultBtn: HTMLButtonElement = document.createElement('button');
	defaultBtn.type = 'button';
	defaultBtn.className = 'notectl-color-picker__default';
	defaultBtn.textContent = locale.defaultColor;
	defaultBtn.addEventListener('mousedown', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		resetTableBorderColor(context, locale);
		onClose();
	});
	defaultBtn.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	});
	container.appendChild(defaultBtn);

	// --- No borders button ---
	const noBordersBtn: HTMLButtonElement = document.createElement('button');
	noBordersBtn.type = 'button';
	noBordersBtn.className = 'notectl-color-picker__default';
	noBordersBtn.textContent = locale.noBorders;
	noBordersBtn.addEventListener('mousedown', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setTableBorderColor(context, 'none', locale);
		onClose();
	});
	noBordersBtn.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	});
	container.appendChild(noBordersBtn);

	// --- Color grid ---
	const grid: HTMLDivElement = document.createElement('div');
	grid.className = 'notectl-color-picker__grid';
	grid.setAttribute('role', 'grid');
	grid.setAttribute('aria-label', locale.borderColorPicker);

	const swatches: HTMLButtonElement[] = [];
	let focusedIndex = 0;

	for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
		const row: HTMLDivElement = document.createElement('div');
		row.setAttribute('role', 'row');

		for (let colIdx = 0; colIdx < COLUMNS; colIdx++) {
			const swatchIdx: number = rowIdx * COLUMNS + colIdx;
			if (swatchIdx >= totalSwatches) break;

			const color: string = BORDER_COLOR_PALETTE[swatchIdx] as string;
			const colorName: string = getColorName(color);
			const isActive: boolean =
				!!currentColor && currentColor.toLowerCase() === color.toLowerCase();

			const swatch: HTMLButtonElement = document.createElement('button');
			swatch.type = 'button';
			swatch.className = 'notectl-color-picker__swatch';
			swatch.setAttribute('role', 'gridcell');
			swatch.setAttribute('aria-label', locale.borderSwatchLabel(colorName));
			swatch.setAttribute('aria-selected', String(isActive));
			swatch.dataset.index = String(swatchIdx);
			swatch.style.backgroundColor = color;
			swatch.title = colorName;

			if (isLightColor(color)) {
				swatch.style.border = '1px solid #d0d0d0';
			}

			if (isActive) {
				swatch.classList.add('notectl-color-picker__swatch--active');
				focusedIndex = swatchIdx;
			}

			swatch.addEventListener('mousedown', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				setTableBorderColor(context, color, locale);
				onClose();
			});

			swatches.push(swatch);
			row.appendChild(swatch);
		}

		grid.appendChild(row);
	}

	applySwatchTabindex(swatches, focusedIndex);

	grid.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
			return;
		}

		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			const target = e.target as HTMLElement;
			const idx: string | undefined = target.dataset.index;
			if (idx !== undefined) {
				const color: string | undefined = BORDER_COLOR_PALETTE[Number(idx)];
				if (color) {
					setTableBorderColor(context, color, locale);
					onClose();
				}
			}
			return;
		}

		if (GRID_NAV_KEYS.has(e.key)) {
			e.preventDefault();
			const currentRow: number = Math.floor(focusedIndex / COLUMNS) + 1;
			const currentCol: number = (focusedIndex % COLUMNS) + 1;

			const [newRow, newCol] = navigateGrid(
				currentRow,
				currentCol,
				totalRows,
				COLUMNS,
				e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
			);

			let newIdx: number = (newRow - 1) * COLUMNS + (newCol - 1);
			if (newIdx >= totalSwatches) {
				newIdx = totalSwatches - 1;
			}

			focusedIndex = newIdx;
			applySwatchTabindex(swatches, focusedIndex);
			swatches[focusedIndex]?.focus();
			return;
		}

		if (e.key === 'Home' || e.key === 'End') {
			e.preventDefault();
			const currentRow: number = Math.floor(focusedIndex / COLUMNS);
			const rowStart: number = currentRow * COLUMNS;
			const rowEnd: number = Math.min(rowStart + COLUMNS - 1, totalSwatches - 1);
			focusedIndex = e.key === 'Home' ? rowStart : rowEnd;
			applySwatchTabindex(swatches, focusedIndex);
			swatches[focusedIndex]?.focus();
		}
	});

	container.appendChild(grid);
}

/** Sets tabindex="0" on the focused swatch, "-1" on all others. */
function applySwatchTabindex(swatches: readonly HTMLButtonElement[], focusedIndex: number): void {
	for (let i = 0; i < swatches.length; i++) {
		const swatch = swatches[i];
		if (swatch) {
			swatch.setAttribute('tabindex', i === focusedIndex ? '0' : '-1');
		}
	}
}
