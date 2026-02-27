/**
 * Accessible context menu for table operations.
 * Triggered via right-click, Shift-F10 keyboard shortcut, or table actions button.
 * Provides fully keyboard-navigable access to all table actions.
 * Delegates lifecycle to PopupManager when available, falls back to manual DOM.
 * Prevents key events from escaping to the editor via stopPropagation.
 */

import type { BlockId } from '../../model/TypeBrands.js';
import { setStyleProperties, setStyleProperty } from '../../style/StyleRuntime.js';
import type { PluginContext } from '../Plugin.js';
import type { PopupHandle, PopupManager } from '../shared/PopupManager.js';
import { positionPopup } from '../shared/PopupPositioning.js';
import { applyRovingTabindex } from '../toolbar/ToolbarKeyboardNav.js';
import { renderBorderColorPicker } from './TableBorderColor.js';
import { TABLE_LOCALE_EN, type TableLocale } from './TableLocale.js';

// --- Types ---

export interface TableContextMenuHandle {
	isOpen(): boolean;
	close(): void;
	destroy(): void;
}

interface MenuEntry {
	readonly label: string;
	readonly command: string;
	readonly type: 'item';
}

interface MenuSeparator {
	readonly type: 'separator';
}

interface MenuSubmenu {
	readonly label: string;
	readonly type: 'submenu';
	readonly id: string;
}

type MenuDefinition = MenuEntry | MenuSeparator | MenuSubmenu;

// --- Menu Structure ---

function buildMenuItems(locale: TableLocale): readonly MenuDefinition[] {
	return [
		{ type: 'item', label: locale.insertRowAbove, command: 'addRowAbove' },
		{ type: 'item', label: locale.insertRowBelow, command: 'addRowBelow' },
		{ type: 'separator' },
		{ type: 'item', label: locale.insertColumnLeft, command: 'addColumnLeft' },
		{ type: 'item', label: locale.insertColumnRight, command: 'addColumnRight' },
		{ type: 'separator' },
		{ type: 'item', label: locale.deleteRow, command: 'deleteRow' },
		{ type: 'item', label: locale.deleteColumn, command: 'deleteColumn' },
		{ type: 'separator' },
		{ type: 'submenu', label: locale.borderColorLabel, id: 'borderColor' },
		{ type: 'separator' },
		{ type: 'item', label: locale.deleteTable, command: 'deleteTable' },
	];
}

// --- Factory ---

/**
 * Creates and displays an accessible context menu for table operations.
 * Attaches to the provided container (shadow root or editor container).
 */
export function createTableContextMenu(
	container: HTMLElement,
	context: PluginContext,
	tableId: BlockId,
	anchorRect: DOMRect,
	onClosed?: () => void,
	locale: TableLocale = TABLE_LOCALE_EN,
	popupManager?: PopupManager,
): TableContextMenuHandle {
	let open = true;
	let subPopup: HTMLDivElement | null = null;
	let subHandle: PopupHandle | null = null;

	// --- Menu element ---
	const menu: HTMLDivElement = document.createElement('div');
	menu.className = 'notectl-table-context-menu';
	menu.setAttribute('role', 'menu');
	menu.setAttribute('aria-label', locale.tableActions);
	menu.setAttribute('contenteditable', 'false');

	// --- Build menu items ---
	const menuItems: HTMLButtonElement[] = [];
	let focusedIndex = 0;

	const menuDefs: readonly MenuDefinition[] = buildMenuItems(locale);
	for (const def of menuDefs) {
		if (def.type === 'separator') {
			const sep: HTMLDivElement = document.createElement('div');
			sep.setAttribute('role', 'separator');
			menu.appendChild(sep);
			continue;
		}

		const btn: HTMLButtonElement = document.createElement('button');
		btn.type = 'button';
		btn.setAttribute('role', 'menuitem');
		btn.textContent = def.label;

		if (def.type === 'submenu') {
			btn.dataset.submenu = def.id;
			btn.setAttribute('aria-haspopup', 'true');
			btn.setAttribute('aria-expanded', 'false');
		}

		if (def.type === 'item') {
			btn.dataset.command = def.command;
		}

		btn.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
		});

		btn.addEventListener('click', (e: MouseEvent) => {
			e.stopPropagation();
			if (def.type === 'item') {
				context.executeCommand(def.command);
				close();
			} else if (def.type === 'submenu') {
				openSubmenu(btn);
			}
		});

		menuItems.push(btn);
		menu.appendChild(btn);
	}

	// --- Keyboard hint ---
	const hint: HTMLDivElement = document.createElement('div');
	hint.className = 'notectl-table-context-menu__hint';
	hint.setAttribute('aria-hidden', 'true');
	hint.textContent = locale.menuKeyboardHint;
	menu.appendChild(hint);

	applyRovingTabindex(menuItems, focusedIndex);

	// --- Keyboard navigation ---
	menu.addEventListener('keydown', (e: KeyboardEvent) => {
		e.stopPropagation();

		switch (e.key) {
			case 'Escape':
				e.preventDefault();
				close();
				return;

			case 'ArrowDown': {
				e.preventDefault();
				focusedIndex = (focusedIndex + 1) % menuItems.length;
				applyRovingTabindex(menuItems, focusedIndex);
				menuItems[focusedIndex]?.focus();
				return;
			}

			case 'ArrowUp': {
				e.preventDefault();
				focusedIndex = (focusedIndex - 1 + menuItems.length) % menuItems.length;
				applyRovingTabindex(menuItems, focusedIndex);
				menuItems[focusedIndex]?.focus();
				return;
			}

			case 'ArrowRight': {
				e.preventDefault();
				const item = menuItems[focusedIndex];
				if (item?.dataset.submenu) {
					openSubmenu(item);
				}
				return;
			}

			case 'ArrowLeft': {
				e.preventDefault();
				closeSubmenu();
				menuItems[focusedIndex]?.focus();
				return;
			}

			case 'Enter':
			case ' ': {
				e.preventDefault();
				const item = menuItems[focusedIndex];
				if (!item) return;
				if (item.dataset.submenu) {
					openSubmenu(item);
				} else if (item.dataset.command) {
					context.executeCommand(item.dataset.command);
					close();
				}
				return;
			}

			case 'Home': {
				e.preventDefault();
				focusedIndex = 0;
				applyRovingTabindex(menuItems, focusedIndex);
				menuItems[focusedIndex]?.focus();
				return;
			}

			case 'End': {
				e.preventDefault();
				focusedIndex = menuItems.length - 1;
				applyRovingTabindex(menuItems, focusedIndex);
				menuItems[focusedIndex]?.focus();
				return;
			}
		}
	});

	// --- Submenu handling ---
	function openSubmenu(trigger: HTMLButtonElement): void {
		closeSubmenu();
		trigger.setAttribute('aria-expanded', 'true');

		if (popupManager) {
			const menuHandle: PopupHandle = {
				close: () => close(),
				getElement: () => menu,
			};

			subHandle = popupManager.open({
				anchor: trigger,
				position: 'right',
				referenceNode: menu,
				parent: menuHandle,
				onClose: () => {
					subHandle = null;
					subPopup = null;
					resetSubmenuTriggers();
				},
				content: (popup: HTMLElement, closeSub: () => void) => {
					popup.className = 'notectl-table-context-menu';
					popup.setAttribute('contenteditable', 'false');
					subPopup = popup as HTMLDivElement;

					popup.addEventListener('keydown', (e: KeyboardEvent) => {
						e.stopPropagation();
						if (e.key === 'ArrowLeft') {
							e.preventDefault();
							closeSub();
							trigger.focus();
						}
					});

					renderBorderColorPicker(popup, context, tableId, () => close(), locale);
				},
			});
		} else {
			subPopup = document.createElement('div');
			subPopup.className = 'notectl-table-context-menu';
			setStyleProperty(subPopup, 'position', 'fixed');
			subPopup.setAttribute('contenteditable', 'false');

			subPopup.addEventListener('keydown', (e: KeyboardEvent) => {
				e.stopPropagation();
				if (e.key === 'ArrowLeft') {
					e.preventDefault();
					closeSubmenu();
					trigger.focus();
				}
			});

			renderBorderColorPicker(subPopup, context, tableId, () => close(), locale);

			container.appendChild(subPopup);

			const triggerRect: DOMRect = trigger.getBoundingClientRect();
			const menuRect: DOMRect = menu.getBoundingClientRect();
			let left: number = menuRect.right + 2;
			let top: number = triggerRect.top;

			const vpWidth: number = window.innerWidth;
			const vpHeight: number = window.innerHeight;

			if (left + 200 > vpWidth) {
				left = menuRect.left - 200 - 2;
			}
			if (top + 200 > vpHeight) {
				top = vpHeight - 200;
			}

			setStyleProperties(subPopup, {
				left: `${left}px`,
				top: `${top}px`,
			});

			requestAnimationFrame(() => {
				const firstFocusable = subPopup?.querySelector('button') as HTMLElement | null;
				firstFocusable?.focus();
			});
		}
	}

	function closeSubmenu(): void {
		if (subHandle) {
			subHandle.close();
			subHandle = null;
			subPopup = null;
		} else if (subPopup) {
			subPopup.remove();
			subPopup = null;
		}
		resetSubmenuTriggers();
	}

	function resetSubmenuTriggers(): void {
		for (const item of menuItems) {
			if (item.dataset.submenu) {
				item.setAttribute('aria-expanded', 'false');
			}
		}
	}

	// --- Positioning & append ---
	positionPopup(menu, anchorRect, { position: 'below-start' });
	container.appendChild(menu);

	// Focus first item immediately and via rAF as backup
	menuItems[0]?.focus();
	requestAnimationFrame(() => {
		if (open && menuItems[0]) {
			menuItems[0].focus();
		}
	});

	// --- Click outside ---
	const onClickOutside = (e: MouseEvent): void => {
		const path: EventTarget[] = e.composedPath();
		if (path.includes(menu) || (subPopup && path.includes(subPopup))) {
			return;
		}
		close();
	};
	setTimeout(() => {
		document.addEventListener('mousedown', onClickOutside, true);
	}, 0);

	// --- Close function ---
	function close(): void {
		if (!open) return;
		open = false;
		closeSubmenu();
		menu.remove();
		document.removeEventListener('mousedown', onClickOutside, true);
		onClosed?.();
	}

	return {
		isOpen: () => open,
		close,
		destroy: close,
	};
}
