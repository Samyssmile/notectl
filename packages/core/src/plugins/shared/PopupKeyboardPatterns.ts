/**
 * Pure functions that attach WAI-ARIA keyboard patterns to popup containers.
 * Supports menu, listbox, and grid navigation patterns.
 * Delegates to ToolbarKeyboardNav for shared navigation logic.
 */

import {
	applyRovingTabindex,
	findNextDropdownItem,
	navigateGrid,
} from '../toolbar/ToolbarKeyboardNav.js';

// --- Types ---

export interface MenuKeyboardConfig {
	readonly container: HTMLElement;
	readonly itemSelector: string;
	readonly onActivate: (item: HTMLElement) => void;
	readonly onClose: () => void;
	readonly getActiveElement: () => Element | null;
}

export interface ListboxKeyboardConfig {
	readonly container: HTMLElement;
	readonly itemSelector: string;
	readonly onSelect: (item: HTMLElement) => void;
	readonly onClose: () => void;
}

export interface GridKeyboardConfig {
	readonly container: HTMLElement;
	readonly cellSelector: string;
	readonly columns: number;
	readonly totalCells: number;
	readonly onSelect: (cell: HTMLElement) => void;
	readonly onClose: () => void;
	readonly onNavigate?: (index: number) => void;
}

// --- Constants ---

const GRID_NAV_KEYS: ReadonlySet<string> = new Set([
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
]);

// --- Menu Keyboard ---

/**
 * Attaches menu keyboard navigation (ArrowUp/Down, Enter/Space, Home/End, Escape).
 * Returns a cleanup function that removes the event listener.
 */
export function attachMenuKeyboard(config: MenuKeyboardConfig): () => void {
	let focusedIndex = 0;

	const handler = (e: KeyboardEvent): void => {
		e.stopPropagation();
		const items: HTMLElement[] = Array.from(
			config.container.querySelectorAll(config.itemSelector),
		) as HTMLElement[];
		if (items.length === 0) return;

		switch (e.key) {
			case 'Escape': {
				e.preventDefault();
				config.onClose();
				return;
			}
			case 'ArrowDown': {
				e.preventDefault();
				focusedIndex = findNextDropdownItem(items, focusedIndex, 1);
				applyRovingTabindex(items as HTMLButtonElement[], focusedIndex);
				items[focusedIndex]?.focus();
				return;
			}
			case 'ArrowUp': {
				e.preventDefault();
				focusedIndex = findNextDropdownItem(items, focusedIndex, -1);
				applyRovingTabindex(items as HTMLButtonElement[], focusedIndex);
				items[focusedIndex]?.focus();
				return;
			}
			case 'Enter':
			case ' ': {
				e.preventDefault();
				const item: HTMLElement | undefined = items[focusedIndex];
				if (item) config.onActivate(item);
				return;
			}
			case 'Home': {
				e.preventDefault();
				focusedIndex = 0;
				applyRovingTabindex(items as HTMLButtonElement[], focusedIndex);
				items[focusedIndex]?.focus();
				return;
			}
			case 'End': {
				e.preventDefault();
				focusedIndex = items.length - 1;
				applyRovingTabindex(items as HTMLButtonElement[], focusedIndex);
				items[focusedIndex]?.focus();
				return;
			}
		}
	};

	config.container.addEventListener('keydown', handler);
	return () => config.container.removeEventListener('keydown', handler);
}

// --- Listbox Keyboard ---

/**
 * Attaches listbox keyboard navigation (ArrowUp/Down, Enter/Space, Escape).
 * Returns a cleanup function.
 */
export function attachListboxKeyboard(config: ListboxKeyboardConfig): () => void {
	let focusedIndex = 0;

	const handler = (e: KeyboardEvent): void => {
		const items: HTMLElement[] = Array.from(
			config.container.querySelectorAll(config.itemSelector),
		) as HTMLElement[];
		if (items.length === 0) return;

		switch (e.key) {
			case 'Escape': {
				e.preventDefault();
				config.onClose();
				return;
			}
			case 'ArrowDown': {
				e.preventDefault();
				focusedIndex = findNextDropdownItem(items, focusedIndex, 1);
				applyRovingTabindex(items as HTMLButtonElement[], focusedIndex);
				items[focusedIndex]?.focus();
				return;
			}
			case 'ArrowUp': {
				e.preventDefault();
				focusedIndex = findNextDropdownItem(items, focusedIndex, -1);
				applyRovingTabindex(items as HTMLButtonElement[], focusedIndex);
				items[focusedIndex]?.focus();
				return;
			}
			case 'Enter':
			case ' ': {
				e.preventDefault();
				const item: HTMLElement | undefined = items[focusedIndex];
				if (item) config.onSelect(item);
				return;
			}
		}
	};

	config.container.addEventListener('keydown', handler);
	return () => config.container.removeEventListener('keydown', handler);
}

// --- Grid Keyboard ---

/**
 * Attaches grid keyboard navigation (2D arrows, Home/End per row, Enter/Space, Escape).
 * Returns a cleanup function.
 */
export function attachGridKeyboard(config: GridKeyboardConfig): () => void {
	let focusedIndex = 0;
	const columns: number = config.columns;
	const totalCells: number = config.totalCells;
	const totalRows: number = Math.ceil(totalCells / columns);

	const handler = (e: KeyboardEvent): void => {
		const cells: HTMLElement[] = Array.from(
			config.container.querySelectorAll(config.cellSelector),
		) as HTMLElement[];
		if (cells.length === 0) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			config.onClose();
			return;
		}

		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			const cell: HTMLElement | undefined = cells[focusedIndex];
			if (cell) config.onSelect(cell);
			return;
		}

		if (GRID_NAV_KEYS.has(e.key)) {
			e.preventDefault();
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
			if (newIdx >= totalCells) {
				newIdx = totalCells - 1;
			}

			focusedIndex = newIdx;
			applyRovingTabindex(cells as HTMLButtonElement[], focusedIndex);
			cells[focusedIndex]?.focus();
			config.onNavigate?.(focusedIndex);
			return;
		}

		if (e.key === 'Home' || e.key === 'End') {
			e.preventDefault();
			const currentRow: number = Math.floor(focusedIndex / columns);
			const rowStart: number = currentRow * columns;
			const rowEnd: number = Math.min(rowStart + columns - 1, totalCells - 1);

			focusedIndex = e.key === 'Home' ? rowStart : rowEnd;
			applyRovingTabindex(cells as HTMLButtonElement[], focusedIndex);
			cells[focusedIndex]?.focus();
			config.onNavigate?.(focusedIndex);
		}
	};

	config.container.addEventListener('keydown', handler);
	return () => config.container.removeEventListener('keydown', handler);
}
