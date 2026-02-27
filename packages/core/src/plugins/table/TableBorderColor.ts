/**
 * Border color commands, transaction builder, and accessible color picker
 * for table borders. Supports theme-default, custom hex, and borderless modes.
 * Delegates grid rendering to the shared ColorGrid module.
 */

import type { BlockAttrs } from '../../model/Document.js';
import { isGapCursor, isNodeSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import { renderColorGrid } from '../shared/ColorGrid.js';
import { getColorName } from '../shared/ColorNames.js';
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
	if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return false;
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
	if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return false;
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

	// --- Color grid (delegated to shared ColorGrid) ---
	renderColorGrid(container, {
		colors: BORDER_COLOR_PALETTE,
		columns: COLUMNS,
		ariaLabel: locale.borderColorPicker,
		ariaLabelPrefix: '',
		activeColor: currentColor ?? null,
		swatchLabel: locale.borderSwatchLabel,
		titleAsName: true,
		onSelect: (color: string) => {
			setTableBorderColor(context, color, locale);
			onClose();
		},
		onClose,
	});
}
