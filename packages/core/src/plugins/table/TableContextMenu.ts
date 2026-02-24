/**
 * Accessible context menu for table operations.
 * Triggered via right-click, Shift-F10 keyboard shortcut, or table actions button.
 * Provides fully keyboard-navigable access to all table actions.
 * Prevents key events from escaping to the editor via stopPropagation.
 */

import type { BlockId } from '../../model/TypeBrands.js';
import type { PluginContext } from '../Plugin.js';
import { renderBorderColorPicker } from './TableBorderColor.js';

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

const MENU_ITEMS: readonly MenuDefinition[] = [
	{ type: 'item', label: 'Insert Row Above', command: 'addRowAbove' },
	{ type: 'item', label: 'Insert Row Below', command: 'addRowBelow' },
	{ type: 'separator' },
	{ type: 'item', label: 'Insert Column Left', command: 'addColumnLeft' },
	{ type: 'item', label: 'Insert Column Right', command: 'addColumnRight' },
	{ type: 'separator' },
	{ type: 'item', label: 'Delete Row', command: 'deleteRow' },
	{ type: 'item', label: 'Delete Column', command: 'deleteColumn' },
	{ type: 'separator' },
	{ type: 'submenu', label: 'Border Color...', id: 'borderColor' },
	{ type: 'separator' },
	{ type: 'item', label: 'Delete Table', command: 'deleteTable' },
];

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
): TableContextMenuHandle {
	let open = true;
	let subPopup: HTMLDivElement | null = null;

	// --- Menu element ---
	const menu: HTMLDivElement = document.createElement('div');
	menu.className = 'notectl-table-context-menu';
	menu.setAttribute('role', 'menu');
	menu.setAttribute('aria-label', 'Table actions');
	menu.setAttribute('contenteditable', 'false');

	// --- Build menu items ---
	const menuItems: HTMLButtonElement[] = [];
	let focusedIndex = 0;

	for (const def of MENU_ITEMS) {
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
	hint.textContent = '\u2191\u2193 Navigate \u00b7 Enter Select \u00b7 Esc Close';
	menu.appendChild(hint);

	applyMenuTabindex(menuItems, focusedIndex);

	// --- Keyboard navigation ---
	// Stop propagation on ALL keydown events to prevent the editor's
	// KeyboardHandler and table navigation keymaps from intercepting keys.
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
				applyMenuTabindex(menuItems, focusedIndex);
				menuItems[focusedIndex]?.focus();
				return;
			}

			case 'ArrowUp': {
				e.preventDefault();
				focusedIndex = (focusedIndex - 1 + menuItems.length) % menuItems.length;
				applyMenuTabindex(menuItems, focusedIndex);
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
				applyMenuTabindex(menuItems, focusedIndex);
				menuItems[focusedIndex]?.focus();
				return;
			}

			case 'End': {
				e.preventDefault();
				focusedIndex = menuItems.length - 1;
				applyMenuTabindex(menuItems, focusedIndex);
				menuItems[focusedIndex]?.focus();
				return;
			}
		}
	});

	// --- Submenu handling ---
	function openSubmenu(trigger: HTMLButtonElement): void {
		closeSubmenu();
		trigger.setAttribute('aria-expanded', 'true');

		subPopup = document.createElement('div');
		subPopup.className = 'notectl-table-context-menu';
		subPopup.style.position = 'fixed';
		subPopup.setAttribute('contenteditable', 'false');

		// Prevent all keydown events from escaping the submenu to the editor.
		// Also handle ArrowLeft to close the submenu and return focus.
		subPopup.addEventListener('keydown', (e: KeyboardEvent) => {
			e.stopPropagation();
			if (e.key === 'ArrowLeft') {
				e.preventDefault();
				closeSubmenu();
				trigger.focus();
			}
		});

		renderBorderColorPicker(subPopup, context, tableId, () => {
			close();
		});

		container.appendChild(subPopup);

		// Position submenu next to trigger
		const triggerRect: DOMRect = trigger.getBoundingClientRect();
		const menuRect: DOMRect = menu.getBoundingClientRect();
		let left: number = menuRect.right + 2;
		let top: number = triggerRect.top;

		// Viewport boundary check
		const vpWidth: number = window.innerWidth;
		const vpHeight: number = window.innerHeight;

		if (left + 200 > vpWidth) {
			left = menuRect.left - 200 - 2;
		}
		if (top + 200 > vpHeight) {
			top = vpHeight - 200;
		}

		subPopup.style.left = `${left}px`;
		subPopup.style.top = `${top}px`;

		// Focus the first focusable element in the submenu
		requestAnimationFrame(() => {
			const firstFocusable = subPopup?.querySelector('button') as HTMLElement | null;
			firstFocusable?.focus();
		});
	}

	function closeSubmenu(): void {
		if (subPopup) {
			subPopup.remove();
			subPopup = null;
		}
		// Reset aria-expanded on all submenu triggers
		for (const item of menuItems) {
			if (item.dataset.submenu) {
				item.setAttribute('aria-expanded', 'false');
			}
		}
	}

	// --- Positioning ---
	positionMenu(menu, anchorRect);
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
	// Use setTimeout to avoid catching the triggering click
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

// --- Helpers ---

/** Positions the menu at the anchor, clamping to viewport edges. */
function positionMenu(menu: HTMLElement, anchorRect: DOMRect): void {
	const vpWidth: number = window.innerWidth;
	const vpHeight: number = window.innerHeight;

	let left: number = anchorRect.left;
	let top: number = anchorRect.top;

	// Estimate menu size (will adjust after render if needed)
	const estimatedWidth = 200;
	const estimatedHeight = 340;

	if (left + estimatedWidth > vpWidth) {
		left = vpWidth - estimatedWidth;
	}
	if (top + estimatedHeight > vpHeight) {
		top = vpHeight - estimatedHeight;
	}
	if (left < 0) left = 0;
	if (top < 0) top = 0;

	menu.style.left = `${left}px`;
	menu.style.top = `${top}px`;
}

/** Sets tabindex="0" on the focused menu item, "-1" on all others. */
function applyMenuTabindex(items: readonly HTMLButtonElement[], focusedIndex: number): void {
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (item) {
			item.setAttribute('tabindex', i === focusedIndex ? '0' : '-1');
		}
	}
}
