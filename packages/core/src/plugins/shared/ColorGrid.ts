/**
 * Shared color grid rendering with WAI-ARIA grid pattern and keyboard
 * navigation. Used by ColorPickerPopup (text-color, highlight) and
 * TableBorderColor.
 */

import { setStyleProperties, setStyleProperty } from '../../style/StyleRuntime.js';
import { applyRovingTabindex, navigateGrid } from '../toolbar/ToolbarKeyboardNav.js';
import { getColorName, isLightColor } from './ColorNames.js';

// --- Types ---

export interface ColorGridConfig {
	readonly colors: readonly string[];
	readonly columns: number;
	readonly ariaLabel: string;
	readonly ariaLabelPrefix: string;
	readonly activeColor: string | null;
	readonly onSelect: (color: string) => void;
	readonly onClose: () => void;
	/** Optional custom label formatter for swatch aria-labels. Defaults to `${prefix} ${colorName}`. */
	readonly swatchLabel?: (colorName: string) => string;
	/** When true, swatch title shows human-readable color name instead of hex. */
	readonly titleAsName?: boolean;
}

// --- Constants ---

const GRID_NAV_KEYS: ReadonlySet<string> = new Set([
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
]);
const LIGHT_COLOR_BORDER = '1px solid #d0d0d0';

// --- Rendering ---

/**
 * Renders an accessible color grid into the given container.
 * Creates a `role="grid"` with rows of `role="gridcell"` swatch buttons.
 * Provides arrow key, Home/End, Enter/Space, and Escape keyboard navigation.
 */
export function renderColorGrid(container: HTMLElement, config: ColorGridConfig): void {
	const columns: number = config.columns;
	const totalSwatches: number = config.colors.length;
	const totalRows: number = Math.ceil(totalSwatches / columns);

	const grid: HTMLDivElement = document.createElement('div');
	grid.className = 'notectl-color-picker__grid';
	grid.setAttribute('role', 'grid');
	grid.setAttribute('aria-label', config.ariaLabel);

	const swatches: HTMLButtonElement[] = [];
	let focusedIndex = 0;

	for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
		const row: HTMLDivElement = document.createElement('div');
		row.setAttribute('role', 'row');

		for (let colIdx = 0; colIdx < columns; colIdx++) {
			const swatchIdx: number = rowIdx * columns + colIdx;
			if (swatchIdx >= totalSwatches) break;

			const color: string = config.colors[swatchIdx] as string;
			const colorName: string = getColorName(color);
			const isActive: boolean =
				!!config.activeColor && config.activeColor.toLowerCase() === color.toLowerCase();

			const swatch: HTMLButtonElement = document.createElement('button');
			swatch.type = 'button';
			swatch.className = 'notectl-color-picker__swatch';
			swatch.setAttribute('role', 'gridcell');
			const label: string = config.swatchLabel
				? config.swatchLabel(colorName)
				: `${config.ariaLabelPrefix} ${colorName}`;
			swatch.setAttribute('aria-label', label);
			swatch.setAttribute('aria-selected', String(isActive));
			swatch.dataset.index = String(swatchIdx);
			setStyleProperty(swatch, 'backgroundColor', color);
			swatch.title = config.titleAsName ? colorName : color;

			if (isLightColor(color)) {
				setStyleProperties(swatch, {
					border: LIGHT_COLOR_BORDER,
				});
			}

			if (isActive) {
				swatch.classList.add('notectl-color-picker__swatch--active');
				focusedIndex = swatchIdx;
			}

			swatch.addEventListener('mousedown', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				config.onSelect(color);
			});

			swatches.push(swatch);
			row.appendChild(swatch);
		}

		grid.appendChild(row);
	}

	applyRovingTabindex(swatches as readonly HTMLButtonElement[], focusedIndex);

	grid.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			config.onClose();
			return;
		}

		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			e.stopPropagation();
			const target = e.target as HTMLElement;
			const idx: string | undefined = target.dataset.index;
			if (idx !== undefined) {
				const color: string | undefined = config.colors[Number(idx)];
				if (color) {
					config.onSelect(color);
				}
			}
			return;
		}

		if (GRID_NAV_KEYS.has(e.key)) {
			e.preventDefault();
			e.stopPropagation();
			const currentRow: number = Math.floor(focusedIndex / columns) + 1;
			const currentCol: number = (focusedIndex % columns) + 1;

			const [newRow, newCol] = navigateGrid(
				currentRow,
				currentCol,
				totalRows,
				columns,
				e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
			);

			let newIdx: number = (newRow - 1) * columns + (newCol - 1);
			if (newIdx >= totalSwatches) {
				newIdx = totalSwatches - 1;
			}

			focusedIndex = newIdx;
			applyRovingTabindex(swatches as readonly HTMLButtonElement[], focusedIndex);
			swatches[focusedIndex]?.focus();
			return;
		}

		if (e.key === 'Home' || e.key === 'End') {
			e.preventDefault();
			e.stopPropagation();
			const currentRow: number = Math.floor(focusedIndex / columns);
			const rowStart: number = currentRow * columns;
			const rowEnd: number = Math.min(rowStart + columns - 1, totalSwatches - 1);

			focusedIndex = e.key === 'Home' ? rowStart : rowEnd;
			applyRovingTabindex(swatches as readonly HTMLButtonElement[], focusedIndex);
			swatches[focusedIndex]?.focus();
		}
	});

	container.appendChild(grid);
}
