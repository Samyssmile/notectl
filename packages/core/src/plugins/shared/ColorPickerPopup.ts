/**
 * Shared color picker popup rendering with WAI-ARIA grid keyboard navigation.
 * Used by TextColorPlugin and HighlightPlugin.
 */

import type { MarkAttrRegistry } from '../../model/AttrRegistry.js';
import type { PluginContext } from '../Plugin.js';
import { navigateGrid } from '../toolbar/ToolbarKeyboardNav.js';
import { applyColorMark, getActiveColor } from './ColorMarkOperations.js';

/** Color mark type names that have `{ color: string }` attrs. */
type ColorMarkType = {
	[K in keyof MarkAttrRegistry]: MarkAttrRegistry[K] extends { color: string } ? K : never;
}[keyof MarkAttrRegistry];

/** Configuration for `renderColorPickerPopup`. */
export interface ColorPickerConfig {
	readonly markType: ColorMarkType;
	readonly colors: readonly string[];
	readonly columns: number;
	readonly resetLabel: string;
	readonly resetCommand: string;
	readonly ariaLabelPrefix: string;
	readonly onClose: () => void;
}

const GRID_NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const COLUMNS = 10;

/**
 * Renders an accessible color picker popup into `container`.
 *
 * Features:
 * - WAI-ARIA `role="grid"` with row/gridcell structure
 * - Arrow key navigation (wraps around, clamps on partial last row)
 * - Enter/Space selects color and closes popup
 * - Escape closes popup
 * - Roving tabindex on swatches
 */
export function renderColorPickerPopup(
	container: HTMLElement,
	context: PluginContext,
	config: ColorPickerConfig,
): void {
	container.classList.add('notectl-color-picker');

	const state = context.getState();
	const activeColor: string | null = getActiveColor(state, config.markType);
	const columns: number = config.columns || COLUMNS;
	const totalSwatches: number = config.colors.length;
	const totalRows: number = Math.ceil(totalSwatches / columns);

	// --- Reset button ---
	const resetBtn: HTMLButtonElement = document.createElement('button');
	resetBtn.type = 'button';
	resetBtn.className = 'notectl-color-picker__default';
	resetBtn.textContent = config.resetLabel;
	resetBtn.addEventListener('mousedown', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		context.executeCommand(config.resetCommand);
		config.onClose();
	});
	resetBtn.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			config.onClose();
		}
	});
	container.appendChild(resetBtn);

	// --- Color grid ---
	const grid: HTMLDivElement = document.createElement('div');
	grid.className = 'notectl-color-picker__grid';
	grid.setAttribute('role', 'grid');
	grid.setAttribute('aria-label', `${config.ariaLabelPrefix} color picker`);

	const swatches: HTMLButtonElement[] = [];
	let focusedIndex = 0;

	// Build rows for ARIA structure
	for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
		const row: HTMLDivElement = document.createElement('div');
		row.setAttribute('role', 'row');

		for (let colIdx = 0; colIdx < columns; colIdx++) {
			const swatchIdx: number = rowIdx * columns + colIdx;
			if (swatchIdx >= totalSwatches) break;

			const color: string = config.colors[swatchIdx] as string;
			const swatch: HTMLButtonElement = document.createElement('button');
			swatch.type = 'button';
			swatch.className = 'notectl-color-picker__swatch';
			swatch.setAttribute('role', 'gridcell');
			swatch.setAttribute('aria-label', `${config.ariaLabelPrefix} ${color}`);
			swatch.dataset.index = String(swatchIdx);
			swatch.style.backgroundColor = color;
			swatch.title = color;

			if (color === '#ffffff') {
				swatch.style.border = '1px solid #d0d0d0';
			}

			if (activeColor && activeColor.toLowerCase() === color.toLowerCase()) {
				swatch.classList.add('notectl-color-picker__swatch--active');
				focusedIndex = swatchIdx;
			}

			// Mouse handler
			swatch.addEventListener('mousedown', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				applyColorMark(context, context.getState(), config.markType, color);
				config.onClose();
			});

			swatches.push(swatch);
			row.appendChild(swatch);
		}

		grid.appendChild(row);
	}

	// Apply initial roving tabindex
	applySwatchTabindex(swatches, focusedIndex);

	// --- Keyboard navigation (delegated on the grid) ---
	grid.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			config.onClose();
			return;
		}

		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			const target = e.target as HTMLElement;
			const idx: string | undefined = target.dataset.index;
			if (idx !== undefined) {
				const color: string | undefined = config.colors[Number(idx)];
				if (color) {
					applyColorMark(context, context.getState(), config.markType, color);
					config.onClose();
				}
			}
			return;
		}

		if (GRID_NAV_KEYS.has(e.key)) {
			e.preventDefault();
			const currentRow: number = Math.floor(focusedIndex / columns) + 1;
			const currentCol: number = (focusedIndex % columns) + 1;

			const maxRows: number = totalRows;
			const maxCols: number = columns;

			const [newRow, newCol] = navigateGrid(
				currentRow,
				currentCol,
				maxRows,
				maxCols,
				e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
			);

			// Convert back to 0-based index and clamp to valid range
			let newIdx: number = (newRow - 1) * columns + (newCol - 1);
			if (newIdx >= totalSwatches) {
				newIdx = totalSwatches - 1;
			}

			focusedIndex = newIdx;
			applySwatchTabindex(swatches, focusedIndex);
			swatches[focusedIndex]?.focus();
		}
	});

	container.appendChild(grid);
}

/** Sets `tabindex="0"` on the focused swatch, `-1` on all others. */
function applySwatchTabindex(swatches: readonly HTMLButtonElement[], focusedIndex: number): void {
	for (let i = 0; i < swatches.length; i++) {
		const swatch = swatches[i];
		if (swatch) {
			swatch.setAttribute('tabindex', i === focusedIndex ? '0' : '-1');
		}
	}
}
