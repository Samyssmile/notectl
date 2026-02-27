import { describe, expect, it, vi } from 'vitest';
import {
	attachGridKeyboard,
	attachListboxKeyboard,
	attachMenuKeyboard,
} from './PopupKeyboardPatterns.js';

// --- Helpers ---

function createItems(
	count: number,
	role: string,
): { container: HTMLDivElement; items: HTMLButtonElement[] } {
	const container: HTMLDivElement = document.createElement('div');
	const items: HTMLButtonElement[] = [];
	for (let i = 0; i < count; i++) {
		const btn: HTMLButtonElement = document.createElement('button');
		btn.setAttribute('role', role);
		btn.textContent = `Item ${i}`;
		container.appendChild(btn);
		items.push(btn);
	}
	return { container, items };
}

function dispatch(target: HTMLElement, key: string): void {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

// --- Tests ---

describe('PopupKeyboardPatterns', () => {
	describe('attachMenuKeyboard', () => {
		it('ArrowDown moves focus to next item', () => {
			const { container, items } = createItems(3, 'menuitem');
			const onActivate = vi.fn();
			const onClose = vi.fn();

			attachMenuKeyboard({
				container,
				itemSelector: '[role="menuitem"]',
				onActivate,
				onClose,
				getActiveElement: () => document.activeElement,
			});

			dispatch(container, 'ArrowDown');

			expect(items[1]?.getAttribute('tabindex')).toBe('0');
			expect(items[0]?.getAttribute('tabindex')).toBe('-1');
		});

		it('ArrowUp moves focus to previous item (wraps)', () => {
			const { container, items } = createItems(3, 'menuitem');

			attachMenuKeyboard({
				container,
				itemSelector: '[role="menuitem"]',
				onActivate: vi.fn(),
				onClose: vi.fn(),
				getActiveElement: () => document.activeElement,
			});

			dispatch(container, 'ArrowUp');

			// Wraps from 0 to last
			expect(items[2]?.getAttribute('tabindex')).toBe('0');
		});

		it('Enter calls onActivate with the focused item', () => {
			const { container, items } = createItems(3, 'menuitem');
			const onActivate = vi.fn();

			attachMenuKeyboard({
				container,
				itemSelector: '[role="menuitem"]',
				onActivate,
				onClose: vi.fn(),
				getActiveElement: () => document.activeElement,
			});

			dispatch(container, 'Enter');

			expect(onActivate).toHaveBeenCalledWith(items[0]);
		});

		it('Escape calls onClose', () => {
			const { container } = createItems(3, 'menuitem');
			const onClose = vi.fn();

			attachMenuKeyboard({
				container,
				itemSelector: '[role="menuitem"]',
				onActivate: vi.fn(),
				onClose,
				getActiveElement: () => document.activeElement,
			});

			dispatch(container, 'Escape');

			expect(onClose).toHaveBeenCalledOnce();
		});

		it('Home moves to first item', () => {
			const { container, items } = createItems(3, 'menuitem');

			attachMenuKeyboard({
				container,
				itemSelector: '[role="menuitem"]',
				onActivate: vi.fn(),
				onClose: vi.fn(),
				getActiveElement: () => document.activeElement,
			});

			// Move down first
			dispatch(container, 'ArrowDown');
			dispatch(container, 'ArrowDown');
			// Now at index 2
			expect(items[2]?.getAttribute('tabindex')).toBe('0');

			dispatch(container, 'Home');
			expect(items[0]?.getAttribute('tabindex')).toBe('0');
		});

		it('End moves to last item', () => {
			const { container, items } = createItems(3, 'menuitem');

			attachMenuKeyboard({
				container,
				itemSelector: '[role="menuitem"]',
				onActivate: vi.fn(),
				onClose: vi.fn(),
				getActiveElement: () => document.activeElement,
			});

			dispatch(container, 'End');
			expect(items[2]?.getAttribute('tabindex')).toBe('0');
		});

		it('returns cleanup function that removes listener', () => {
			const { container } = createItems(3, 'menuitem');
			const onClose = vi.fn();

			const cleanup = attachMenuKeyboard({
				container,
				itemSelector: '[role="menuitem"]',
				onActivate: vi.fn(),
				onClose,
				getActiveElement: () => document.activeElement,
			});

			cleanup();
			dispatch(container, 'Escape');
			expect(onClose).not.toHaveBeenCalled();
		});

		it('stops propagation on keydown events', () => {
			const parent: HTMLDivElement = document.createElement('div');
			const { container } = createItems(3, 'menuitem');
			parent.appendChild(container);
			const parentHandler = vi.fn();
			parent.addEventListener('keydown', parentHandler);

			attachMenuKeyboard({
				container,
				itemSelector: '[role="menuitem"]',
				onActivate: vi.fn(),
				onClose: vi.fn(),
				getActiveElement: () => document.activeElement,
			});

			dispatch(container, 'ArrowDown');
			expect(parentHandler).not.toHaveBeenCalled();
		});
	});

	describe('attachListboxKeyboard', () => {
		it('ArrowDown moves through options', () => {
			const { container, items } = createItems(3, 'option');

			attachListboxKeyboard({
				container,
				itemSelector: '[role="option"]',
				onSelect: vi.fn(),
				onClose: vi.fn(),
			});

			dispatch(container, 'ArrowDown');
			expect(items[1]?.getAttribute('tabindex')).toBe('0');
		});

		it('Enter calls onSelect', () => {
			const { container, items } = createItems(3, 'option');
			const onSelect = vi.fn();

			attachListboxKeyboard({
				container,
				itemSelector: '[role="option"]',
				onSelect,
				onClose: vi.fn(),
			});

			dispatch(container, 'Enter');
			expect(onSelect).toHaveBeenCalledWith(items[0]);
		});

		it('Escape calls onClose', () => {
			const { container } = createItems(3, 'option');
			const onClose = vi.fn();

			attachListboxKeyboard({
				container,
				itemSelector: '[role="option"]',
				onSelect: vi.fn(),
				onClose,
			});

			dispatch(container, 'Escape');
			expect(onClose).toHaveBeenCalledOnce();
		});
	});

	describe('attachGridKeyboard', () => {
		function createGrid(
			rows: number,
			cols: number,
		): { container: HTMLDivElement; cells: HTMLButtonElement[] } {
			const container: HTMLDivElement = document.createElement('div');
			const cells: HTMLButtonElement[] = [];
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const cell: HTMLButtonElement = document.createElement('button');
					cell.setAttribute('role', 'gridcell');
					cell.dataset.index = String(r * cols + c);
					container.appendChild(cell);
					cells.push(cell);
				}
			}
			return { container, cells };
		}

		it('ArrowRight moves to next cell', () => {
			const { container, cells } = createGrid(2, 3);

			attachGridKeyboard({
				container,
				cellSelector: '[role="gridcell"]',
				columns: 3,
				totalCells: 6,
				onSelect: vi.fn(),
				onClose: vi.fn(),
			});

			dispatch(container, 'ArrowRight');
			expect(cells[1]?.getAttribute('tabindex')).toBe('0');
			expect(cells[0]?.getAttribute('tabindex')).toBe('-1');
		});

		it('ArrowDown moves to next row', () => {
			const { container, cells } = createGrid(2, 3);

			attachGridKeyboard({
				container,
				cellSelector: '[role="gridcell"]',
				columns: 3,
				totalCells: 6,
				onSelect: vi.fn(),
				onClose: vi.fn(),
			});

			dispatch(container, 'ArrowDown');
			expect(cells[3]?.getAttribute('tabindex')).toBe('0');
		});

		it('Enter calls onSelect', () => {
			const { container, cells } = createGrid(2, 3);
			const onSelect = vi.fn();

			attachGridKeyboard({
				container,
				cellSelector: '[role="gridcell"]',
				columns: 3,
				totalCells: 6,
				onSelect,
				onClose: vi.fn(),
			});

			dispatch(container, 'Enter');
			expect(onSelect).toHaveBeenCalledWith(cells[0]);
		});

		it('Escape calls onClose', () => {
			const { container } = createGrid(2, 3);
			const onClose = vi.fn();

			attachGridKeyboard({
				container,
				cellSelector: '[role="gridcell"]',
				columns: 3,
				totalCells: 6,
				onSelect: vi.fn(),
				onClose,
			});

			dispatch(container, 'Escape');
			expect(onClose).toHaveBeenCalledOnce();
		});

		it('Home moves to first cell in row', () => {
			const { container, cells } = createGrid(2, 3);

			attachGridKeyboard({
				container,
				cellSelector: '[role="gridcell"]',
				columns: 3,
				totalCells: 6,
				onSelect: vi.fn(),
				onClose: vi.fn(),
			});

			// Move right twice (to col 3)
			dispatch(container, 'ArrowRight');
			dispatch(container, 'ArrowRight');
			expect(cells[2]?.getAttribute('tabindex')).toBe('0');

			dispatch(container, 'Home');
			expect(cells[0]?.getAttribute('tabindex')).toBe('0');
		});

		it('End moves to last cell in row', () => {
			const { container, cells } = createGrid(2, 3);

			attachGridKeyboard({
				container,
				cellSelector: '[role="gridcell"]',
				columns: 3,
				totalCells: 6,
				onSelect: vi.fn(),
				onClose: vi.fn(),
			});

			dispatch(container, 'End');
			expect(cells[2]?.getAttribute('tabindex')).toBe('0');
		});

		it('clamps to last cell on partial row', () => {
			const { container, cells } = createGrid(2, 3);
			// Only 5 total cells instead of 6 (partial last row)
			cells[5]?.remove();
			const trimmedCells = cells.slice(0, 5);

			attachGridKeyboard({
				container,
				cellSelector: '[role="gridcell"]',
				columns: 3,
				totalCells: 5,
				onSelect: vi.fn(),
				onClose: vi.fn(),
			});

			// Move to col 3, row 1 (index 2)
			dispatch(container, 'ArrowRight');
			dispatch(container, 'ArrowRight');

			// ArrowDown should go to row 2 col 3 = index 5 → clamp to 4
			dispatch(container, 'ArrowDown');
			expect(trimmedCells[4]?.getAttribute('tabindex')).toBe('0');
		});

		it('calls onNavigate callback', () => {
			const { container } = createGrid(2, 3);
			const onNavigate = vi.fn();

			attachGridKeyboard({
				container,
				cellSelector: '[role="gridcell"]',
				columns: 3,
				totalCells: 6,
				onSelect: vi.fn(),
				onClose: vi.fn(),
				onNavigate,
			});

			dispatch(container, 'ArrowRight');
			expect(onNavigate).toHaveBeenCalledWith(1);
		});
	});
});
