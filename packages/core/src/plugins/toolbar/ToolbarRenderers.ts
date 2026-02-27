/**
 * ToolbarRenderers: pure rendering functions for toolbar popup content.
 * Grid pickers, dropdown menus, and separator elements.
 */

import { setStyleProperties } from '../../style/StyleRuntime.js';
import type { DropdownConfig, GridPickerConfig } from './ToolbarItem.js';

const HIGHLIGHTED_CLASS = 'notectl-grid-picker__cell--highlighted';

/**
 * Renders a grid picker into the given container.
 * Calls `onClose` after a cell is selected so the popup can be dismissed.
 */
export function renderGridPicker(
	container: HTMLElement,
	config: GridPickerConfig,
	onClose: () => void,
): void {
	container.className += ' notectl-grid-picker';

	const grid: HTMLDivElement = document.createElement('div');
	grid.className = 'notectl-grid-picker__grid';
	grid.setAttribute('role', 'grid');
	setStyleProperties(grid, {
		display: 'grid',
		gridTemplateColumns: `repeat(${config.maxCols}, 1fr)`,
		gap: '2px',
		padding: '8px',
	});

	const label: HTMLDivElement = document.createElement('div');
	label.className = 'notectl-grid-picker__label';
	label.textContent = '1 x 1';
	setStyleProperties(label, {
		textAlign: 'center',
		padding: '4px',
		fontSize: '12px',
	});
	label.setAttribute('aria-live', 'polite');

	for (let r = 1; r <= config.maxRows; r++) {
		for (let c = 1; c <= config.maxCols; c++) {
			const cell: HTMLDivElement = document.createElement('div');
			cell.className = 'notectl-grid-picker__cell';
			cell.setAttribute('role', 'gridcell');
			cell.setAttribute('tabindex', '-1');
			cell.setAttribute('aria-label', `${r} x ${c}`);
			setStyleProperties(cell, {
				width: '20px',
				height: '20px',
				border: '1px solid #ccc',
				cursor: 'pointer',
			});
			cell.setAttribute('data-row', String(r));
			cell.setAttribute('data-col', String(c));

			cell.addEventListener('mouseenter', () => {
				highlightCells(grid, r, c);
				label.textContent = `${r} x ${c}`;
			});

			cell.addEventListener('mousedown', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				config.onSelect(r, c);
				onClose();
			});

			cell.addEventListener('click', () => {
				config.onSelect(r, c);
				onClose();
			});

			grid.appendChild(cell);
		}
	}

	container.appendChild(grid);
	container.appendChild(label);
}

/**
 * Highlights grid cells up to the given row/col and updates the label.
 * Used by both mouse hover and keyboard navigation.
 */
export function highlightCells(grid: HTMLElement, targetRow: number, targetCol: number): void {
	const cells: NodeListOf<Element> = grid.querySelectorAll('.notectl-grid-picker__cell');
	for (const cell of cells) {
		const r: number = Number(cell.getAttribute('data-row'));
		const c: number = Number(cell.getAttribute('data-col'));
		cell.classList.toggle(HIGHLIGHTED_CLASS, r <= targetRow && c <= targetCol);
	}
}

/**
 * Renders a dropdown menu into the given container.
 * Calls `onClose` after an item is activated so the popup can be dismissed.
 */
export function renderDropdown(
	container: HTMLElement,
	config: DropdownConfig,
	executeCommand: (command: string) => void,
	onClose: () => void,
): void {
	container.classList.add('notectl-dropdown');
	container.setAttribute('role', 'menu');

	for (const item of config.items) {
		const btn: HTMLButtonElement = document.createElement('button');
		btn.type = 'button';
		btn.className = 'notectl-dropdown__item';
		btn.setAttribute('role', 'menuitem');
		btn.setAttribute('tabindex', '-1');

		if (item.icon) {
			const iconSpan: HTMLSpanElement = document.createElement('span');
			iconSpan.className = 'notectl-dropdown__item-icon';
			iconSpan.innerHTML = item.icon;
			btn.appendChild(iconSpan);
		}

		const labelSpan: HTMLSpanElement = document.createElement('span');
		labelSpan.className = 'notectl-dropdown__item-label';
		labelSpan.textContent = item.label;
		btn.appendChild(labelSpan);

		btn.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			executeCommand(item.command);
			onClose();
		});

		btn.addEventListener('click', () => {
			executeCommand(item.command);
			onClose();
		});

		container.appendChild(btn);
	}
}

/** Creates a toolbar group separator element. */
export function createSeparator(): HTMLSpanElement {
	const sep: HTMLSpanElement = document.createElement('span');
	sep.className = 'notectl-toolbar-separator';
	sep.setAttribute('role', 'separator');
	return sep;
}
