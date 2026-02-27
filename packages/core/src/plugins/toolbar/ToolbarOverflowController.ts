/**
 * ToolbarOverflowController: manages responsive toolbar overflow.
 * Uses ResizeObserver to detect when items exceed available width,
 * hides overflow items, and shows a "more" dropdown button.
 * Delegates popup lifecycle to PopupManager when available.
 */

import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import type { PopupHandle, PopupManager } from '../shared/PopupManager.js';
import { appendToRoot } from '../shared/PopupPositioning.js';
import type { ToolbarItem } from './ToolbarItem.js';
import { findNextDropdownItem } from './ToolbarKeyboardNav.js';

// --- Types ---

interface OverflowEntry {
	readonly element: HTMLButtonElement;
	readonly item: ToolbarItem;
}

type OnOverflowChange = (
	visibleButtons: readonly HTMLButtonElement[],
	overflowButton: HTMLButtonElement | null,
) => void;

type OnItemActivated = (overflowButton: HTMLButtonElement, item: ToolbarItem) => void;

export interface OverflowControllerConfig {
	readonly toolbar: HTMLElement;
	readonly ariaLabel: string;
	readonly context: PluginContext;
	readonly onOverflowChange: OnOverflowChange;
	readonly onItemActivated: OnItemActivated;
	readonly getActiveElement: () => Element | null;
	readonly popupManager?: PopupManager;
}

// --- Constants ---

const OVERFLOW_BTN_WIDTH = 34;
const GAP = 2;
const HIDDEN_BTN_CLASS = 'notectl-toolbar-btn--overflow-hidden';
const HIDDEN_SEP_CLASS = 'notectl-toolbar-separator--overflow-hidden';
const HIDDEN_OVERFLOW_CLASS = 'notectl-toolbar-overflow-btn--hidden';
const ELLIPSIS_SVG =
	'<svg viewBox="0 0 16 16" width="16" height="16"><circle cx="3" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/><circle cx="13" cy="8" r="1.5" fill="currentColor"/></svg>';

// --- Controller ---

export class ToolbarOverflowController {
	private readonly toolbar: HTMLElement;
	private readonly context: PluginContext;
	private readonly onOverflowChange: OnOverflowChange;
	private readonly onItemActivated: OnItemActivated;
	private readonly getActiveElement: () => Element | null;
	private readonly ariaLabel: string;
	private readonly popupManager: PopupManager | null;

	private entries: OverflowEntry[] = [];
	private overflowButton: HTMLButtonElement | null = null;
	private overflowDropdown: HTMLElement | null = null;
	private overflowHandle: PopupHandle | null = null;
	private overflowEntries: OverflowEntry[] = [];
	private resizeObserver: ResizeObserver | null = null;
	private closeHandler: ((e: MouseEvent) => void) | null = null;

	constructor(config: OverflowControllerConfig) {
		this.toolbar = config.toolbar;
		this.ariaLabel = config.ariaLabel;
		this.context = config.context;
		this.onOverflowChange = config.onOverflowChange;
		this.onItemActivated = config.onItemActivated;
		this.getActiveElement = config.getActiveElement;
		this.popupManager = config.popupManager ?? null;

		this.resizeObserver = new ResizeObserver(() => this.recalculate());
		this.resizeObserver.observe(this.toolbar);
	}

	/** Called after renderItems() — stores button references and recalculates. */
	update(buttons: readonly { element: HTMLButtonElement; item: ToolbarItem }[]): void {
		this.entries = buttons.map((b) => ({ element: b.element, item: b.item }));
		this.recalculate();
	}

	/** Measures toolbar and redistributes items between visible and overflow. */
	recalculate(): void {
		if (this.entries.length === 0) return;

		this.closeDropdown();
		this.resetVisibility();
		this.ensureOverflowButton();
		this.setOverflowButtonVisible(false);

		const availableWidth: number = this.measureAvailableWidth();
		const maxWidth: number = availableWidth - OVERFLOW_BTN_WIDTH - GAP;
		let usedWidth = 0;
		let overflowing = false;
		const overflowList: OverflowEntry[] = [];

		const children: HTMLElement[] = Array.from(this.toolbar.children) as HTMLElement[];
		for (const child of children) {
			if (child === this.overflowButton) continue;

			if (child.classList.contains('notectl-toolbar-separator')) {
				if (overflowing) {
					child.classList.add(HIDDEN_SEP_CLASS);
					continue;
				}
				const sepWidth: number = child.offsetWidth + GAP;
				if (usedWidth + sepWidth > maxWidth) {
					overflowing = true;
					child.classList.add(HIDDEN_SEP_CLASS);
				} else {
					usedWidth += sepWidth;
				}
				continue;
			}

			const entry: OverflowEntry | undefined = this.entries.find((oe) => oe.element === child);
			if (!entry) continue;

			if (overflowing) {
				entry.element.classList.add(HIDDEN_BTN_CLASS);
				overflowList.push(entry);
				continue;
			}

			const btnWidth: number = entry.element.offsetWidth + GAP;
			if (usedWidth + btnWidth > maxWidth) {
				overflowing = true;
				entry.element.classList.add(HIDDEN_BTN_CLASS);
				overflowList.push(entry);
			} else {
				usedWidth += btnWidth;
			}
		}

		this.overflowEntries = overflowList;
		this.hideTrailingSeparators();
		this.setOverflowButtonVisible(overflowList.length > 0);
		this.notifyChange();
	}

	/** Updates active/disabled states for items in the open overflow dropdown. */
	updateItemStates(state: EditorState): void {
		if (!this.overflowDropdown) return;

		const menuItems: HTMLButtonElement[] = Array.from(
			this.overflowDropdown.querySelectorAll('.notectl-dropdown__item'),
		) as HTMLButtonElement[];

		for (const menuItem of menuItems) {
			const itemId: string | null = menuItem.getAttribute('data-toolbar-item');
			const entry: OverflowEntry | undefined = this.overflowEntries.find(
				(oe) => oe.item.id === itemId,
			);
			if (!entry) continue;

			const active: boolean = entry.item.isActive?.(state) ?? false;
			const enabled: boolean = entry.item.isEnabled?.(state) ?? true;
			menuItem.classList.toggle('notectl-dropdown__item--active', active);
			menuItem.disabled = !enabled;

			if (entry.item.popupType === 'combobox') {
				const labelEl: HTMLSpanElement | null = menuItem.querySelector(
					'.notectl-dropdown__item-label',
				);
				if (labelEl) {
					labelEl.textContent = entry.item.getLabel(state);
				}
			}
		}
	}

	/** Cleans up ResizeObserver, DOM elements, and event listeners. */
	destroy(): void {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.closeDropdown();
		this.overflowButton?.remove();
		this.overflowButton = null;
		this.entries = [];
		this.overflowEntries = [];
	}

	// --- Measurement ---

	private measureAvailableWidth(): number {
		const toolbarStyle: CSSStyleDeclaration = getComputedStyle(this.toolbar);
		const paddingLeft: number = Number.parseFloat(toolbarStyle.paddingLeft) || 0;
		const paddingRight: number = Number.parseFloat(toolbarStyle.paddingRight) || 0;
		return this.toolbar.clientWidth - paddingLeft - paddingRight;
	}

	private resetVisibility(): void {
		for (const entry of this.entries) {
			entry.element.classList.remove(HIDDEN_BTN_CLASS);
		}
		const separators: HTMLElement[] = Array.from(
			this.toolbar.querySelectorAll('.notectl-toolbar-separator'),
		) as HTMLElement[];
		for (const sep of separators) {
			sep.classList.remove(HIDDEN_SEP_CLASS);
		}
	}

	// --- Overflow Button ---

	private setOverflowButtonVisible(visible: boolean): void {
		if (!this.overflowButton) return;
		this.overflowButton.classList.toggle(HIDDEN_OVERFLOW_CLASS, !visible);
		if (!visible) {
			this.overflowButton.removeAttribute('tabindex');
		}
	}

	private ensureOverflowButton(): void {
		if (this.overflowButton) return;

		const btn: HTMLButtonElement = document.createElement('button');
		btn.type = 'button';
		btn.className = 'notectl-toolbar-overflow-btn';
		btn.setAttribute('aria-label', this.ariaLabel);
		btn.setAttribute('aria-haspopup', 'true');
		btn.setAttribute('aria-expanded', 'false');
		btn.innerHTML = ELLIPSIS_SVG;

		btn.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			this.toggleDropdown();
		});

		this.toolbar.appendChild(btn);
		this.overflowButton = btn;
	}

	// --- Dropdown ---

	private toggleDropdown(): void {
		if (this.overflowDropdown) {
			this.closeDropdown();
		} else {
			this.openDropdown();
		}
	}

	private openDropdown(): void {
		if (!this.overflowButton || this.overflowEntries.length === 0) return;

		const dropdown: HTMLDivElement = document.createElement('div');
		dropdown.className = 'notectl-toolbar-popup notectl-dropdown';
		dropdown.setAttribute('role', 'menu');

		this.renderDropdownItems(dropdown, this.context.getState());

		if (this.popupManager) {
			this.overflowHandle = this.popupManager.open({
				anchor: this.overflowButton,
				className: 'notectl-toolbar-popup notectl-dropdown',
				ariaRole: 'menu',
				position: 'below-end',
				referenceNode: this.overflowButton,
				restoreFocusTo: this.overflowButton,
				onClose: () => {
					this.overflowHandle = null;
					this.overflowDropdown = null;
					if (this.overflowButton) {
						this.overflowButton.setAttribute('aria-expanded', 'false');
					}
				},
				content: (popup: HTMLElement) => {
					this.renderDropdownItems(popup, this.context.getState());
					this.overflowDropdown = popup;
					popup.addEventListener('keydown', (e: KeyboardEvent) => this.handleDropdownKeydown(e));
				},
			});
			this.overflowButton.setAttribute('aria-expanded', 'true');
		} else {
			this.positionDropdown(dropdown);
			appendToRoot(dropdown, this.overflowButton);
			this.overflowDropdown = dropdown;
			this.overflowButton.setAttribute('aria-expanded', 'true');

			requestAnimationFrame(() => {
				const first: HTMLElement | null = dropdown.querySelector('[role="menuitem"]');
				first?.focus();
			});

			dropdown.addEventListener('keydown', (e: KeyboardEvent) => this.handleDropdownKeydown(e));
			this.registerCloseHandler();
		}
	}

	private renderDropdownItems(dropdown: HTMLElement, state: EditorState): void {
		let lastGroup: string | null = null;

		for (const entry of this.overflowEntries) {
			if (lastGroup !== null && entry.item.group !== lastGroup) {
				const sep: HTMLDivElement = document.createElement('div');
				sep.className = 'notectl-dropdown__separator';
				sep.setAttribute('role', 'separator');
				dropdown.appendChild(sep);
			}
			lastGroup = entry.item.group;

			const menuBtn: HTMLButtonElement = document.createElement('button');
			menuBtn.type = 'button';
			menuBtn.className = 'notectl-dropdown__item';
			menuBtn.setAttribute('role', 'menuitem');
			menuBtn.setAttribute('tabindex', '-1');
			menuBtn.setAttribute('data-toolbar-item', entry.item.id);

			const iconSpan: HTMLSpanElement = document.createElement('span');
			iconSpan.className = 'notectl-dropdown__item-icon';
			if (entry.item.popupType !== 'combobox') {
				iconSpan.innerHTML = entry.item.icon;
			}
			menuBtn.appendChild(iconSpan);

			const labelSpan: HTMLSpanElement = document.createElement('span');
			labelSpan.className = 'notectl-dropdown__item-label';
			labelSpan.textContent =
				entry.item.popupType === 'combobox'
					? entry.item.getLabel(state)
					: (entry.item.tooltip ?? entry.item.label);
			menuBtn.appendChild(labelSpan);

			menuBtn.addEventListener('mousedown', (ev: MouseEvent) => {
				ev.preventDefault();
				ev.stopPropagation();
				this.activateOverflowItem(entry);
			});

			dropdown.appendChild(menuBtn);
		}
	}

	private positionDropdown(dropdown: HTMLElement): void {
		if (!this.overflowButton) return;

		const rect: DOMRect = this.overflowButton.getBoundingClientRect();
		const rightEdge: number = window.innerWidth - rect.right;

		dropdown.style.position = 'fixed';
		dropdown.style.top = `${rect.bottom + 2}px`;
		dropdown.style.right = `${rightEdge}px`;
		dropdown.style.left = 'auto';
		dropdown.style.zIndex = '10000';
	}

	private registerCloseHandler(): void {
		this.closeHandler = (ev: MouseEvent) => {
			const path: EventTarget[] = ev.composedPath();
			if (
				this.overflowDropdown &&
				!path.includes(this.overflowDropdown) &&
				this.overflowButton &&
				!path.includes(this.overflowButton)
			) {
				this.closeDropdown();
			}
		};
		setTimeout(() => {
			if (this.closeHandler) {
				document.addEventListener('mousedown', this.closeHandler);
			}
		}, 0);
	}

	private closeDropdown(): void {
		if (this.overflowHandle) {
			const handle: PopupHandle = this.overflowHandle;
			this.overflowHandle = null;
			this.overflowDropdown = null;
			handle.close();
			if (this.overflowButton) {
				this.overflowButton.setAttribute('aria-expanded', 'false');
			}
			return;
		}

		if (this.overflowDropdown) {
			this.overflowDropdown.remove();
			this.overflowDropdown = null;
		}
		if (this.overflowButton) {
			this.overflowButton.setAttribute('aria-expanded', 'false');
		}
		if (this.closeHandler) {
			document.removeEventListener('mousedown', this.closeHandler);
			this.closeHandler = null;
		}
	}

	private activateOverflowItem(entry: OverflowEntry): void {
		this.closeDropdown();
		if (entry.item.popupType && this.overflowButton) {
			this.onItemActivated(this.overflowButton, entry.item);
		} else {
			this.context.executeCommand(entry.item.command);
		}
	}

	// --- Keyboard Navigation ---

	private handleDropdownKeydown(e: KeyboardEvent): void {
		if (!this.overflowDropdown) return;

		if (e.key === 'Escape' || e.key === 'Tab') {
			e.preventDefault();
			e.stopPropagation();
			this.closeDropdown();
			this.overflowButton?.focus();
			return;
		}

		const items: HTMLElement[] = Array.from(
			this.overflowDropdown.querySelectorAll('[role="menuitem"]'),
		) as HTMLElement[];
		const current: number = items.indexOf(this.getActiveElement() as HTMLElement);

		switch (e.key) {
			case 'ArrowDown': {
				e.preventDefault();
				const next: number = findNextDropdownItem(items, current, 1);
				items[next]?.focus();
				break;
			}
			case 'ArrowUp': {
				e.preventDefault();
				const prev: number = findNextDropdownItem(items, current, -1);
				items[prev]?.focus();
				break;
			}
			case 'Enter':
			case ' ': {
				e.preventDefault();
				const focusedItem: HTMLElement | undefined = items[current];
				if (!focusedItem) break;
				const itemId: string | null = focusedItem.getAttribute('data-toolbar-item');
				const entry: OverflowEntry | undefined = this.overflowEntries.find(
					(oe) => oe.item.id === itemId,
				);
				if (entry) this.activateOverflowItem(entry);
				break;
			}
		}
	}

	// --- Helpers ---

	private hideTrailingSeparators(): void {
		const children: HTMLElement[] = Array.from(this.toolbar.children) as HTMLElement[];
		for (let i = children.length - 1; i >= 0; i--) {
			const child: HTMLElement | undefined = children[i];
			if (!child || child === this.overflowButton) continue;
			if (child.classList.contains('notectl-toolbar-separator')) {
				if (!child.classList.contains(HIDDEN_SEP_CLASS)) {
					child.classList.add(HIDDEN_SEP_CLASS);
				}
			} else if (!child.classList.contains(HIDDEN_BTN_CLASS)) {
				break;
			}
		}
	}

	private notifyChange(): void {
		const visible: HTMLButtonElement[] = this.entries
			.filter((oe) => !oe.element.classList.contains(HIDDEN_BTN_CLASS))
			.map((oe) => oe.element);
		this.onOverflowChange(visible, this.overflowEntries.length > 0 ? this.overflowButton : null);
	}
}
