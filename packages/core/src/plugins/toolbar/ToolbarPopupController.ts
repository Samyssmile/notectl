/**
 * ToolbarPopupController: manages popup lifecycle, positioning, keyboard
 * navigation, and auto-close for toolbar popups (grid pickers, dropdowns,
 * and custom popups). Delegates lifecycle to PopupManager.
 */

import { isRtlContext } from '../../platform/Platform.js';
import type { PluginContext } from '../Plugin.js';
import { findNextDropdownItem, navigateGrid } from '../shared/KeyboardNav.js';
import type {
	PopupCloseOptions,
	PopupConfig,
	PopupHandle,
	PopupServiceAPI,
} from '../shared/PopupManager.js';
import type { ToolbarItem } from './ToolbarItem.js';
import { TOOLBAR_LOCALE_EN, type ToolbarLocale } from './ToolbarLocale.js';
import { highlightCells, renderDropdown, renderGridPicker } from './ToolbarRenderers.js';

export class ToolbarPopupController {
	private activePopup: HTMLElement | null = null;
	private activePopupButton: HTMLElement | null = null;
	private activeHandle: PopupHandle | null = null;
	private readonly getActiveElement: () => Element | null;
	private readonly locale: ToolbarLocale;
	private popupManager: PopupServiceAPI | null = null;

	constructor(getActiveElement: () => Element | null, locale: ToolbarLocale = TOOLBAR_LOCALE_EN) {
		this.getActiveElement = getActiveElement;
		this.locale = locale;
	}

	/** Injects the PopupManager instance (called after service registration). */
	setPopupManager(manager: PopupServiceAPI): void {
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

		this.open(item, context, { anchor: button, restoreFocusTo: button, trigger: button });
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
		const triggerBtn: HTMLElement | null = this.activePopupButton;
		this.close();
		triggerBtn?.focus();
	}

	destroy(): void {
		this.close();
	}

	// --- PopupManager path ---

	open(
		item: ToolbarItem,
		context: PluginContext,
		options: {
			readonly anchor: PopupConfig['anchor'];
			readonly restoreFocusTo?: HTMLElement;
			readonly trigger?: HTMLElement;
			readonly onClose?: () => void;
		},
	): PopupHandle | null {
		if (!this.popupManager) return null;
		this.close();
		const button = options.trigger;

		this.activePopupButton = button ?? null;
		button?.classList.add('notectl-toolbar-btn--popup-open');
		button?.setAttribute('aria-expanded', 'true');

		const handle = this.popupManager.open({
			anchor: options.anchor,
			className: 'notectl-toolbar-popup',
			referenceNode: context.getContainer(),
			restoreFocusTo: options.restoreFocusTo ?? button ?? context.getContainer(),
			position: 'below-start',
			onClose: () => {
				// Called when PopupManager closes the popup (click-outside, etc.)
				this.activeHandle = null;
				this.clearButtonState();
				this.activePopup = null;
				options.onClose?.();
			},
			content: (popup: HTMLElement, close: (options?: PopupCloseOptions) => void) => {
				this.activePopup = popup;
				this.renderPopupContent(popup, item, context, close);
				popup.addEventListener('keydown', (e: KeyboardEvent) => this.handlePopupKeydown(e));
			},
		});
		this.activeHandle = this.activePopup ? handle : null;
		return this.activeHandle;
	}

	// --- Shared rendering ---

	private renderPopupContent(
		popup: HTMLElement,
		item: ToolbarItem,
		context: PluginContext,
		close: (options?: PopupCloseOptions) => void,
	): void {
		const closeAndFocusEditor = (): void => {
			close({ restoreFocusTo: null });
			context.getContainer().focus();
		};

		switch (item.popupType) {
			case 'gridPicker':
				renderGridPicker(popup, item.popupConfig, closeAndFocusEditor, this.locale);
				break;
			case 'dropdown':
				renderDropdown(
					popup,
					item.popupConfig,
					(cmd: string) => context.executeCommand(cmd),
					closeAndFocusEditor,
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

	// --- Keyboard Navigation ---

	private handlePopupKeydown(e: KeyboardEvent): void {
		if (!this.activePopup || e.defaultPrevented || e.isComposing) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			this.closeAndRestoreFocus();
			return;
		}

		if (e.key === 'Tab' && !this.activePopup.querySelector('input, textarea, select')) {
			e.preventDefault();
			this.closeAndRestoreFocus();
			return;
		}
		// Native text editing and feature-specific popup keyboard handlers own inputs.
		if (
			e.target instanceof HTMLElement &&
			(e.target.matches('input, textarea, select') || e.target.isContentEditable)
		)
			return;

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
				this.activePopup ? isRtlContext(this.activePopup) : false,
			);
			const target: HTMLElement | null = grid.querySelector(
				`.notectl-grid-picker__cell[data-row="${newRow}"][data-col="${newCol}"]`,
			);
			target?.focus();

			highlightCells(grid as HTMLElement, newRow, newCol);
			const label: Element | null =
				this.activePopup?.querySelector('.notectl-grid-picker__label') ?? null;
			if (label) label.textContent = this.locale.gridPickerLabel(newRow, newCol);
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
				buttons[currentIdx]?.click();
				break;
			}
		}
	}
}
