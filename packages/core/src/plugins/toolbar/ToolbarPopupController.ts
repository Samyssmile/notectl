/**
 * ToolbarPopupController: manages popup lifecycle, positioning, keyboard
 * navigation, and auto-close for toolbar popups (grid pickers, dropdowns,
 * and custom popups). Delegates lifecycle to PopupManager.
 */

import { setStyleProperties } from '../../style/StyleRuntime.js';
import type { PluginContext } from '../Plugin.js';
import type { PopupHandle, PopupManager } from '../shared/PopupManager.js';
import type { ToolbarItem } from './ToolbarItem.js';
import { findNextDropdownItem, navigateGrid } from './ToolbarKeyboardNav.js';
import { highlightCells, renderDropdown, renderGridPicker } from './ToolbarRenderers.js';

export class ToolbarPopupController {
	private activePopup: HTMLElement | null = null;
	private activePopupButton: HTMLButtonElement | null = null;
	private activeHandle: PopupHandle | null = null;
	private readonly getActiveElement: () => Element | null;
	private popupManager: PopupManager | null = null;

	constructor(getActiveElement: () => Element | null) {
		this.getActiveElement = getActiveElement;
	}

	/** Injects the PopupManager instance (called after service registration). */
	setPopupManager(manager: PopupManager): void {
		this.popupManager = manager;
	}

	/** Whether a popup is currently open. */
	isOpen(): boolean {
		return this.activePopup !== null;
	}

	/** Toggles a popup for the given toolbar button. */
	toggle(button: HTMLButtonElement, item: ToolbarItem, context: PluginContext): void {
		if (this.activePopup) {
			this.close();
			return;
		}

		if (this.popupManager) {
			this.openViaManager(button, item, context);
		} else {
			this.openLegacy(button, item, context);
		}
	}

	/** Closes the active popup and cleans up event listeners. */
	close(): void {
		if (this.activeHandle) {
			// Prevent onClose callback from re-entering
			const handle: PopupHandle = this.activeHandle;
			this.activeHandle = null;
			this.clearButtonState();
			handle.close();
			return;
		}

		this.clearButtonState();
		if (this.activePopup) {
			this.activePopup.remove();
			this.activePopup = null;
		}
	}

	/** Closes popup and restores focus to the trigger button. */
	closeAndRestoreFocus(): void {
		const triggerBtn: HTMLButtonElement | null = this.activePopupButton;
		this.close();
		triggerBtn?.focus();
	}

	destroy(): void {
		this.close();
	}

	// --- PopupManager path ---

	private openViaManager(
		button: HTMLButtonElement,
		item: ToolbarItem,
		context: PluginContext,
	): void {
		if (!this.popupManager) return;

		this.activePopupButton = button;
		button.classList.add('notectl-toolbar-btn--popup-open');
		button.setAttribute('aria-expanded', 'true');

		this.activeHandle = this.popupManager.open({
			anchor: button,
			className: 'notectl-toolbar-popup',
			referenceNode: button,
			restoreFocusTo: button,
			position: 'below-start',
			onClose: () => {
				// Called when PopupManager closes the popup (click-outside, etc.)
				this.activeHandle = null;
				this.clearButtonState();
				this.activePopup = null;
			},
			content: (popup: HTMLElement, close: () => void) => {
				this.activePopup = popup;
				this.renderPopupContent(popup, item, context, close);
				popup.addEventListener('keydown', (e: KeyboardEvent) => this.handlePopupKeydown(e));
			},
		});
	}

	// --- Legacy path (no PopupManager available) ---

	private openLegacy(button: HTMLButtonElement, item: ToolbarItem, context: PluginContext): void {
		const popup: HTMLDivElement = document.createElement('div');
		popup.className = 'notectl-toolbar-popup';

		this.renderPopupContent(popup, item, context, () => this.close());

		this.positionAndAppend(popup, button);

		this.activePopup = popup;
		this.activePopupButton = button;
		button.classList.add('notectl-toolbar-btn--popup-open');
		button.setAttribute('aria-expanded', 'true');

		this.focusFirstItem(popup);

		popup.addEventListener('keydown', (e: KeyboardEvent) => this.handlePopupKeydown(e));

		const closePopupHandler = (e: MouseEvent): void => {
			const path: EventTarget[] = e.composedPath();
			if (!path.includes(popup) && !path.includes(button)) {
				this.close();
			}
		};
		setTimeout(() => {
			document.addEventListener('mousedown', closePopupHandler);
		}, 0);

		// Store handler for cleanup in close
		popup.dataset.legacyClose = 'true';
		const origClose = this.close.bind(this);
		this.close = () => {
			document.removeEventListener('mousedown', closePopupHandler);
			this.close = origClose;
			origClose();
		};
	}

	// --- Shared rendering ---

	private renderPopupContent(
		popup: HTMLElement,
		item: ToolbarItem,
		context: PluginContext,
		close: () => void,
	): void {
		switch (item.popupType) {
			case 'gridPicker':
				renderGridPicker(popup, item.popupConfig, close);
				break;
			case 'dropdown':
				renderDropdown(
					popup,
					item.popupConfig,
					(cmd: string) => context.executeCommand(cmd),
					close,
				);
				break;
			case 'custom':
				item.renderPopup(popup, context, close);
				break;
			case 'combobox':
				item.renderPopup(popup, context, close);
				break;
		}
	}

	// --- Button state ---

	private clearButtonState(): void {
		if (this.activePopupButton) {
			this.activePopupButton.classList.remove('notectl-toolbar-btn--popup-open');
			this.activePopupButton.setAttribute('aria-expanded', 'false');
			this.activePopupButton = null;
		}
	}

	// --- Legacy Positioning ---

	private positionAndAppend(popup: HTMLElement, button: HTMLButtonElement): void {
		const rect: DOMRect = button.getBoundingClientRect();
		setStyleProperties(popup, {
			position: 'fixed',
			top: `${rect.bottom + 2}px`,
			left: `${rect.left}px`,
			zIndex: '10000',
		});

		const root: Node = button.getRootNode();
		if (root instanceof ShadowRoot) {
			root.appendChild(popup);
		} else {
			document.body.appendChild(popup);
		}
	}

	// --- Focus ---

	private focusFirstItem(popup: HTMLElement): void {
		requestAnimationFrame(() => {
			const firstItem: HTMLElement | null =
				popup.querySelector('[role="menuitem"]') ??
				popup.querySelector('.notectl-grid-picker__cell') ??
				popup.querySelector('button');
			firstItem?.focus();
		});
	}

	// --- Keyboard Navigation ---

	private handlePopupKeydown(e: KeyboardEvent): void {
		if (!this.activePopup) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			this.closeAndRestoreFocus();
			return;
		}

		if (e.key === 'Tab') {
			e.preventDefault();
			this.closeAndRestoreFocus();
			return;
		}

		const menuItems: NodeListOf<Element> = this.activePopup.querySelectorAll('[role="menuitem"]');
		if (menuItems.length > 0) {
			this.handleDropdownKeydown(e, menuItems);
			return;
		}

		const hasGrid: boolean = this.activePopup.querySelector('.notectl-grid-picker__cell') !== null;
		if (hasGrid) {
			this.handleGridKeydown(e);
			return;
		}

		this.handleCustomPopupKeydown(e);
	}

	private handleDropdownKeydown(e: KeyboardEvent, items: NodeListOf<Element>): void {
		const itemArr: HTMLElement[] = Array.from(items) as HTMLElement[];
		const current: number = itemArr.indexOf(this.getActiveElement() as HTMLElement);

		switch (e.key) {
			case 'ArrowDown': {
				e.preventDefault();
				const next: number = findNextDropdownItem(itemArr, current, 1);
				itemArr[next]?.focus();
				break;
			}
			case 'ArrowUp': {
				e.preventDefault();
				const prev: number = findNextDropdownItem(itemArr, current, -1);
				itemArr[prev]?.focus();
				break;
			}
			case 'Enter':
			case ' ': {
				e.preventDefault();
				const focused: HTMLElement | undefined = itemArr[current];
				if (focused) focused.click();
				break;
			}
		}
	}

	private handleGridKeydown(e: KeyboardEvent): void {
		const focused: HTMLElement = this.getActiveElement() as HTMLElement;
		const row: number = Number(focused?.getAttribute('data-row') ?? 1);
		const col: number = Number(focused?.getAttribute('data-col') ?? 1);

		const grid: Element | null =
			this.activePopup?.querySelector('.notectl-grid-picker__grid') ?? null;
		if (!grid) return;

		const lastCell: Element | null = grid.querySelector('.notectl-grid-picker__cell:last-child');
		const maxCols: number = Number(lastCell?.getAttribute('data-col') ?? 1);
		const maxRows: number = Number(lastCell?.getAttribute('data-row') ?? 1);

		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
			e.preventDefault();
			const [newRow, newCol]: [number, number] = navigateGrid(
				row,
				col,
				maxRows,
				maxCols,
				e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
			);
			const target: HTMLElement | null = grid.querySelector(
				`.notectl-grid-picker__cell[data-row="${newRow}"][data-col="${newCol}"]`,
			);
			target?.focus();

			highlightCells(grid as HTMLElement, newRow, newCol);
			const label: Element | null =
				this.activePopup?.querySelector('.notectl-grid-picker__label') ?? null;
			if (label) label.textContent = `${newRow} x ${newCol}`;
		}

		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			focused?.click();
		}
	}

	private handleCustomPopupKeydown(e: KeyboardEvent): void {
		if (!this.activePopup) return;
		const buttons: HTMLButtonElement[] = Array.from(this.activePopup.querySelectorAll('button'));
		if (buttons.length === 0) return;
		const active: HTMLElement = this.getActiveElement() as HTMLElement;
		const currentIdx: number = buttons.indexOf(active as HTMLButtonElement);

		switch (e.key) {
			case 'ArrowDown': {
				e.preventDefault();
				const next: number = findNextDropdownItem(buttons, currentIdx, 1);
				buttons[next]?.focus();
				break;
			}
			case 'ArrowUp': {
				e.preventDefault();
				const prev: number = findNextDropdownItem(buttons, currentIdx, -1);
				buttons[prev]?.focus();
				break;
			}
			case 'Enter':
			case ' ': {
				e.preventDefault();
				if (active) {
					active.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
				}
				break;
			}
		}
	}
}
