/**
 * Toolbar plugin: renders toolbar items registered by other plugins.
 * Acts as a pure rendering engine — has no knowledge of specific features.
 * Supports buttons, dropdowns, grid pickers, and custom popups.
 * Implements WAI-ARIA Toolbar pattern with roving tabindex.
 */

import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { ServiceKey } from '../Plugin.js';
import type { Plugin, PluginConfig, PluginContext } from '../Plugin.js';
import type { DropdownConfig, GridPickerConfig, ToolbarItem } from './ToolbarItem.js';
import {
	applyRovingTabindex,
	findFirstEnabled,
	findLastEnabled,
	findNextDropdownItem,
	findNextEnabled,
	navigateGrid,
} from './ToolbarKeyboardNav.js';

// --- Layout Config ---

export interface ToolbarLayoutConfig {
	readonly groups: ReadonlyArray<ReadonlyArray<string>>;
}

// --- Typed Service API ---

export interface ToolbarServiceAPI {
	/** Re-reads isActive/isEnabled from state and updates all buttons. */
	refresh(): void;
}

export const ToolbarServiceKey = new ServiceKey<ToolbarServiceAPI>('toolbar');

// --- Plugin ---

interface ToolbarButton {
	element: HTMLButtonElement;
	item: ToolbarItem;
}

export class ToolbarPlugin implements Plugin {
	readonly id = 'toolbar';
	readonly name = 'Toolbar';
	readonly priority = 10;

	private context: PluginContext | null = null;
	private toolbarElement: HTMLElement | null = null;
	private buttons: ToolbarButton[] = [];
	private activePopup: HTMLElement | null = null;
	private closePopupHandler: ((e: MouseEvent) => void) | null = null;
	private readonly hiddenItems = new Set<string>();
	private tooltipElement: HTMLElement | null = null;
	private tooltipTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly layoutConfig: ToolbarLayoutConfig | null;
	private focusedIndex = 0;
	private activePopupButton: HTMLButtonElement | null = null;
	private tooltipTarget: HTMLButtonElement | null = null;
	private static readonly TOOLTIP_ID = 'notectl-toolbar-tooltip';

	constructor(layoutConfig?: ToolbarLayoutConfig) {
		this.layoutConfig = layoutConfig ?? null;
	}

	init(context: PluginContext): void {
		this.context = context;

		context.registerService(ToolbarServiceKey, {
			refresh: () => this.updateButtonStates(context.getState()),
		});

		this.createToolbarElement();
		this.createTooltipElement();
	}

	onReady(): void {
		this.renderItems();
	}

	destroy(): void {
		this.closePopup();
		this.hideTooltip();
		if (this.tooltipElement) {
			this.tooltipElement.remove();
			this.tooltipElement = null;
		}
		if (this.toolbarElement) {
			this.toolbarElement.remove();
			this.toolbarElement = null;
		}
		this.buttons = [];
		this.context = null;
	}

	onStateChange(_oldState: EditorState, newState: EditorState, _tr: Transaction): void {
		this.updateButtonStates(newState);
	}

	onConfigure(config: PluginConfig): void {
		for (const [key, value] of Object.entries(config)) {
			if (value === false) {
				this.hiddenItems.add(key);
			} else {
				this.hiddenItems.delete(key);
			}
		}
		this.renderItems();
	}

	// --- Tooltip ---

	private createTooltipElement(): void {
		this.tooltipElement = document.createElement('div');
		this.tooltipElement.className = 'notectl-toolbar-tooltip';
		this.tooltipElement.id = ToolbarPlugin.TOOLTIP_ID;
		this.tooltipElement.setAttribute('role', 'tooltip');
		this.tooltipElement.style.display = 'none';
	}

	private showTooltip(button: HTMLButtonElement): void {
		this.hideTooltip();

		if (this.activePopup || button.disabled) return;

		const text = button.getAttribute('data-tooltip');
		if (!text || !this.tooltipElement) return;

		this.tooltipTarget = button;

		this.tooltipTimer = setTimeout(() => {
			if (!this.tooltipElement || this.activePopup) return;

			this.tooltipElement.textContent = text;
			this.tooltipElement.style.display = '';

			// Append to shadow root to escape overflow:hidden on .notectl-editor
			const root = button.getRootNode();
			if (root instanceof ShadowRoot && !this.tooltipElement.parentNode) {
				root.appendChild(this.tooltipElement);
			} else if (!(root instanceof ShadowRoot) && !this.tooltipElement.parentNode) {
				document.body.appendChild(this.tooltipElement);
			}

			// Link button to tooltip via aria-describedby
			button.setAttribute('aria-describedby', ToolbarPlugin.TOOLTIP_ID);

			// Position with fixed coordinates so clipping is impossible
			const rect = button.getBoundingClientRect();
			this.tooltipElement.style.position = 'fixed';
			this.tooltipElement.style.top = `${rect.bottom + 6}px`;
			this.tooltipElement.style.left = `${rect.left + rect.width / 2}px`;
			this.tooltipElement.style.transform = 'translateX(-50%)';
		}, 500);
	}

	private hideTooltip(): void {
		if (this.tooltipTimer) {
			clearTimeout(this.tooltipTimer);
			this.tooltipTimer = null;
		}
		if (this.tooltipTarget) {
			this.tooltipTarget.removeAttribute('aria-describedby');
			this.tooltipTarget = null;
		}
		if (this.tooltipElement) {
			this.tooltipElement.style.display = 'none';
		}
	}

	// --- Toolbar ---

	private createToolbarElement(): void {
		if (!this.context) return;

		if (this.toolbarElement) {
			this.toolbarElement.remove();
		}
		this.buttons = [];

		const container = this.context.getPluginContainer('top');
		this.toolbarElement = document.createElement('div');
		this.toolbarElement.setAttribute('role', 'toolbar');
		this.toolbarElement.setAttribute('aria-label', 'Formatting options');
		this.toolbarElement.className = 'notectl-toolbar';

		this.toolbarElement.addEventListener('keydown', (e) => this.handleToolbarKeydown(e));

		container.appendChild(this.toolbarElement);
	}

	private renderItems(): void {
		if (!this.context || !this.toolbarElement) return;

		// Remove existing buttons
		for (const btn of this.buttons) {
			btn.element.remove();
		}
		this.buttons = [];

		// Remove existing separators
		for (const sep of this.toolbarElement.querySelectorAll('.notectl-toolbar-separator')) {
			sep.remove();
		}

		if (this.layoutConfig) {
			this.renderItemsByLayout();
		} else {
			this.renderItemsByPriority();
		}

		// Re-attach toolbar if it was removed but has visible buttons
		if (this.buttons.length > 0 && !this.toolbarElement.parentElement) {
			const container = this.context.getPluginContainer('top');
			container.appendChild(this.toolbarElement);
		}

		// Apply roving tabindex
		this.initRovingTabindex();

		this.updateButtonStates(this.context.getState());
	}

	/** Initializes roving tabindex after buttons are rendered. */
	private initRovingTabindex(): void {
		const elements = this.buttons.map((b) => b.element);
		const first = findFirstEnabled(elements);
		this.focusedIndex = first >= 0 ? first : 0;
		applyRovingTabindex(elements, this.focusedIndex);
	}

	/** Moves roving focus to a new index and focuses the button. */
	private setRovingFocus(index: number): void {
		if (index < 0 || index >= this.buttons.length) return;
		this.focusedIndex = index;
		const elements = this.buttons.map((b) => b.element);
		applyRovingTabindex(elements, index);
		elements[index]?.focus();
	}

	/** Returns the active element, respecting shadow DOM boundaries. */
	private getActiveElement(): Element | null {
		const root = this.toolbarElement?.getRootNode();
		if (root instanceof ShadowRoot) {
			return root.activeElement;
		}
		return document.activeElement;
	}

	/** Syncs focusedIndex with the actually focused DOM element. */
	private syncFocusedIndex(): void {
		const active = this.getActiveElement();
		const idx = this.buttons.findIndex((b) => b.element === active);
		if (idx >= 0) {
			this.focusedIndex = idx;
		}
	}

	/** Handles keyboard events on the toolbar element. */
	private handleToolbarKeydown(e: KeyboardEvent): void {
		const elements = this.buttons.map((b) => b.element);
		if (elements.length === 0) return;

		// Sync in case focus was set externally (e.g. programmatic .focus())
		this.syncFocusedIndex();

		switch (e.key) {
			case 'ArrowRight': {
				e.preventDefault();
				const next = findNextEnabled(elements, this.focusedIndex, 1);
				this.setRovingFocus(next);
				break;
			}
			case 'ArrowLeft': {
				e.preventDefault();
				const prev = findNextEnabled(elements, this.focusedIndex, -1);
				this.setRovingFocus(prev);
				break;
			}
			case 'Home': {
				e.preventDefault();
				const first = findFirstEnabled(elements);
				if (first >= 0) this.setRovingFocus(first);
				break;
			}
			case 'End': {
				e.preventDefault();
				const last = findLastEnabled(elements);
				if (last >= 0) this.setRovingFocus(last);
				break;
			}
			case 'Enter':
			case ' ': {
				e.preventDefault();
				const btn = this.buttons[this.focusedIndex];
				if (btn) this.activateButton(btn.element, btn.item);
				break;
			}
		}
	}

	/** Activates a toolbar button (shared between mouse click and keyboard). */
	private activateButton(btn: HTMLButtonElement, item: ToolbarItem): void {
		this.hideTooltip();
		if (item.popupType) {
			this.togglePopup(btn, item);
		} else {
			this.context?.executeCommand(item.command);
		}
	}

	private renderItemsByLayout(): void {
		if (!this.context || !this.toolbarElement || !this.layoutConfig) return;

		const registry = this.context.getSchemaRegistry();
		let firstGroup = true;

		for (const groupPluginIds of this.layoutConfig.groups) {
			const groupItems: ToolbarItem[] = [];
			for (const pId of groupPluginIds) {
				const items = registry
					.getToolbarItemsByPlugin(pId)
					.filter((item) => !this.hiddenItems.has(item.id));
				// Sort within plugin by priority (bold before italic etc.)
				items.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
				groupItems.push(...items);
			}

			if (groupItems.length === 0) continue;

			if (!firstGroup) {
				const sep = document.createElement('span');
				sep.className = 'notectl-toolbar-separator';
				sep.setAttribute('role', 'separator');
				this.toolbarElement.appendChild(sep);
			}
			firstGroup = false;

			for (const item of groupItems) {
				const btn = this.createButton(item);
				this.toolbarElement.appendChild(btn.element);
				this.buttons.push(btn);
			}
		}

		if (this.buttons.length === 0) {
			this.toolbarElement.remove();
		}
	}

	private renderItemsByPriority(): void {
		if (!this.context || !this.toolbarElement) return;

		const registry = this.context.getSchemaRegistry();
		const items = registry.getToolbarItems().filter((item) => !this.hiddenItems.has(item.id));
		if (items.length === 0) {
			this.toolbarElement.remove();
			return;
		}

		// Sort by priority (lower = further left)
		const sorted = [...items].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

		const hasSeparatorAfter = sorted.some((item) => item.separatorAfter);

		if (hasSeparatorAfter) {
			for (let i = 0; i < sorted.length; i++) {
				const item = sorted[i];
				if (!item) continue;
				const btn = this.createButton(item);
				this.toolbarElement.appendChild(btn.element);
				this.buttons.push(btn);

				if (item.separatorAfter && i < sorted.length - 1) {
					const sep = document.createElement('span');
					sep.className = 'notectl-toolbar-separator';
					sep.setAttribute('role', 'separator');
					this.toolbarElement.appendChild(sep);
				}
			}
		} else {
			const groups = new Map<string, ToolbarItem[]>();
			for (const item of sorted) {
				const list = groups.get(item.group) ?? [];
				list.push(item);
				groups.set(item.group, list);
			}

			let firstGroup = true;
			for (const [, groupItems] of groups) {
				if (!firstGroup) {
					const sep = document.createElement('span');
					sep.className = 'notectl-toolbar-separator';
					sep.setAttribute('role', 'separator');
					this.toolbarElement.appendChild(sep);
				}
				firstGroup = false;

				for (const item of groupItems) {
					const btn = this.createButton(item);
					this.toolbarElement.appendChild(btn.element);
					this.buttons.push(btn);
				}
			}
		}
	}

	private createButton(item: ToolbarItem): ToolbarButton {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = `notectl-toolbar-btn notectl-toolbar-btn--${item.id}`;
		btn.setAttribute('aria-pressed', 'false');
		btn.setAttribute('aria-label', item.label);
		btn.setAttribute('data-toolbar-item', item.id);
		btn.setAttribute('data-tooltip', item.tooltip ?? item.label);

		// Popup ARIA attributes
		if (item.popupType) {
			btn.setAttribute('aria-haspopup', 'true');
			btn.setAttribute('aria-expanded', 'false');
		}

		const span = document.createElement('span');
		span.className = 'notectl-toolbar-btn__icon';
		span.innerHTML = item.icon;
		btn.appendChild(span);

		btn.addEventListener('mousedown', (e) => {
			e.preventDefault();
			this.activateButton(btn, item);
		});

		btn.addEventListener('mouseenter', () => this.showTooltip(btn));
		btn.addEventListener('mouseleave', () => this.hideTooltip());

		// Phase 5: Tooltip on keyboard focus
		btn.addEventListener('focus', () => this.showTooltip(btn));
		btn.addEventListener('blur', () => this.hideTooltip());

		return { element: btn, item };
	}

	private togglePopup(button: HTMLButtonElement, item: ToolbarItem): void {
		if (this.activePopup) {
			this.closePopup();
			return;
		}

		const popup = document.createElement('div');
		popup.className = 'notectl-toolbar-popup';

		switch (item.popupType) {
			case 'gridPicker':
				this.renderGridPicker(popup, item.popupConfig);
				break;
			case 'dropdown':
				this.renderDropdown(popup, item.popupConfig);
				break;
			case 'custom':
				if (this.context) item.renderPopup(popup, this.context);
				break;
		}

		// Position below the button using fixed coordinates to escape overflow:hidden
		const rect = button.getBoundingClientRect();
		popup.style.position = 'fixed';
		popup.style.top = `${rect.bottom + 2}px`;
		popup.style.left = `${rect.left}px`;
		popup.style.zIndex = '10000';

		// Append to shadow root directly to avoid clipping by .notectl-editor
		const root = button.getRootNode();
		if (root instanceof ShadowRoot) {
			root.appendChild(popup);
		} else {
			document.body.appendChild(popup);
		}

		this.activePopup = popup;
		this.activePopupButton = button;
		button.classList.add('notectl-toolbar-btn--popup-open');
		button.setAttribute('aria-expanded', 'true');

		// Auto-focus first item in popup
		this.focusFirstPopupItem(popup);

		// Keyboard handling inside popup
		popup.addEventListener('keydown', (e) => this.handlePopupKeydown(e));

		this.closePopupHandler = (e: MouseEvent) => {
			if (!popup.contains(e.target as Node) && e.target !== button) {
				this.closePopup();
			}
		};
		setTimeout(() => {
			if (this.closePopupHandler) {
				document.addEventListener('mousedown', this.closePopupHandler);
			}
		}, 0);
	}

	private closePopup(): void {
		if (this.activePopupButton) {
			this.activePopupButton.classList.remove('notectl-toolbar-btn--popup-open');
			this.activePopupButton.setAttribute('aria-expanded', 'false');
			this.activePopupButton = null;
		}
		if (this.activePopup) {
			this.activePopup.remove();
			this.activePopup = null;
		}
		if (this.closePopupHandler) {
			document.removeEventListener('mousedown', this.closePopupHandler);
			this.closePopupHandler = null;
		}
	}

	/** Closes popup and restores focus to the trigger button. */
	private closePopupAndRestoreFocus(): void {
		const triggerBtn = this.activePopupButton;
		this.closePopup();
		triggerBtn?.focus();
	}

	/** Focuses the first interactive item inside a popup. */
	private focusFirstPopupItem(popup: HTMLElement): void {
		requestAnimationFrame(() => {
			const firstItem: HTMLElement | null =
				popup.querySelector('[role="menuitem"]') ??
				popup.querySelector('.notectl-grid-picker__cell') ??
				popup.querySelector('button');
			firstItem?.focus();
		});
	}

	/** Handles keyboard events inside an open popup. */
	private handlePopupKeydown(e: KeyboardEvent): void {
		if (!this.activePopup) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			this.closePopupAndRestoreFocus();
			return;
		}

		if (e.key === 'Tab') {
			e.preventDefault();
			this.closePopupAndRestoreFocus();
			return;
		}

		// Dropdown navigation
		const menuItems = this.activePopup.querySelectorAll('[role="menuitem"]');
		if (menuItems.length > 0) {
			this.handleDropdownKeydown(e, menuItems);
			return;
		}

		// Grid picker navigation
		const gridCells = this.activePopup.querySelectorAll('.notectl-grid-picker__cell');
		if (gridCells.length > 0) {
			this.handleGridKeydown(e, gridCells);
			return;
		}

		// Custom popup fallback: arrow keys navigate buttons, Enter/Space activates
		this.handleCustomPopupKeydown(e);
	}

	/** Handles keyboard events in custom popups (navigates buttons). */
	private handleCustomPopupKeydown(e: KeyboardEvent): void {
		if (!this.activePopup) return;
		const buttons = Array.from(this.activePopup.querySelectorAll('button')) as HTMLButtonElement[];
		if (buttons.length === 0) return;
		const active = this.getActiveElement() as HTMLElement;
		const currentIdx = buttons.indexOf(active as HTMLButtonElement);

		switch (e.key) {
			case 'ArrowDown': {
				e.preventDefault();
				const next = findNextDropdownItem(buttons, currentIdx, 1);
				buttons[next]?.focus();
				break;
			}
			case 'ArrowUp': {
				e.preventDefault();
				const prev = findNextDropdownItem(buttons, currentIdx, -1);
				buttons[prev]?.focus();
				break;
			}
			case 'Enter':
			case ' ': {
				e.preventDefault();
				if (active) {
					// Dispatch mousedown for custom popup handlers that listen to mousedown
					active.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
				}
				break;
			}
		}
	}

	/** Handles arrow key navigation in dropdown menus. */
	private handleDropdownKeydown(e: KeyboardEvent, items: NodeListOf<Element>): void {
		const itemArr = Array.from(items) as HTMLElement[];
		const current = itemArr.indexOf(this.getActiveElement() as HTMLElement);

		switch (e.key) {
			case 'ArrowDown': {
				e.preventDefault();
				const next = findNextDropdownItem(itemArr, current, 1);
				itemArr[next]?.focus();
				break;
			}
			case 'ArrowUp': {
				e.preventDefault();
				const prev = findNextDropdownItem(itemArr, current, -1);
				itemArr[prev]?.focus();
				break;
			}
			case 'Enter':
			case ' ': {
				e.preventDefault();
				const focused = itemArr[current];
				if (focused) focused.click();
				break;
			}
		}
	}

	/** Handles arrow key navigation in grid pickers. */
	private handleGridKeydown(e: KeyboardEvent, cells: NodeListOf<Element>): void {
		const focused = this.getActiveElement() as HTMLElement;
		const row = Number(focused?.getAttribute('data-row') ?? 1);
		const col = Number(focused?.getAttribute('data-col') ?? 1);

		const grid = this.activePopup?.querySelector('.notectl-grid-picker__grid');
		if (!grid) return;

		const maxCols = Number(
			grid.querySelector('.notectl-grid-picker__cell:last-child')?.getAttribute('data-col') ?? 1,
		);
		const maxRows = Number(
			grid.querySelector('.notectl-grid-picker__cell:last-child')?.getAttribute('data-row') ?? 1,
		);

		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
			e.preventDefault();
			const [newRow, newCol] = navigateGrid(
				row,
				col,
				maxRows,
				maxCols,
				e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight',
			);
			const target = grid.querySelector(
				`.notectl-grid-picker__cell[data-row="${newRow}"][data-col="${newCol}"]`,
			) as HTMLElement | null;
			target?.focus();

			// Update highlight
			for (const cell of cells) {
				const cR = Number(cell.getAttribute('data-row'));
				const cC = Number(cell.getAttribute('data-col'));
				(cell as HTMLElement).style.background = cR <= newRow && cC <= newCol ? '#4a9eff' : '';
			}
			const label = this.activePopup?.querySelector('.notectl-grid-picker__label');
			if (label) label.textContent = `${newRow} x ${newCol}`;
		}

		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			focused?.click();
		}
	}

	private renderGridPicker(container: HTMLElement, config: GridPickerConfig): void {
		container.className += ' notectl-grid-picker';
		const grid = document.createElement('div');
		grid.className = 'notectl-grid-picker__grid';
		grid.setAttribute('role', 'grid');
		grid.style.display = 'grid';
		grid.style.gridTemplateColumns = `repeat(${config.maxCols}, 1fr)`;
		grid.style.gap = '2px';
		grid.style.padding = '8px';

		const label = document.createElement('div');
		label.className = 'notectl-grid-picker__label';
		label.textContent = '1 x 1';
		label.style.textAlign = 'center';
		label.style.padding = '4px';
		label.style.fontSize = '12px';
		label.setAttribute('aria-live', 'polite');

		for (let r = 1; r <= config.maxRows; r++) {
			for (let c = 1; c <= config.maxCols; c++) {
				const cell = document.createElement('div');
				cell.className = 'notectl-grid-picker__cell';
				cell.setAttribute('role', 'gridcell');
				cell.setAttribute('tabindex', '-1');
				cell.setAttribute('aria-label', `${r} x ${c}`);
				cell.style.width = '20px';
				cell.style.height = '20px';
				cell.style.border = '1px solid #ccc';
				cell.style.cursor = 'pointer';
				cell.setAttribute('data-row', String(r));
				cell.setAttribute('data-col', String(c));

				cell.addEventListener('mouseenter', () => {
					const cells = grid.querySelectorAll('.notectl-grid-picker__cell');
					for (const other of cells) {
						const otherR = Number(other.getAttribute('data-row'));
						const otherC = Number(other.getAttribute('data-col'));
						(other as HTMLElement).style.background = otherR <= r && otherC <= c ? '#4a9eff' : '';
					}
					label.textContent = `${r} x ${c}`;
				});

				cell.addEventListener('mousedown', (e) => {
					e.preventDefault();
					e.stopPropagation();
					config.onSelect(r, c);
					this.closePopup();
				});

				cell.addEventListener('click', () => {
					config.onSelect(r, c);
					this.closePopup();
				});

				grid.appendChild(cell);
			}
		}

		container.appendChild(grid);
		container.appendChild(label);
	}

	private renderDropdown(container: HTMLElement, config: DropdownConfig): void {
		container.classList.add('notectl-dropdown');
		container.setAttribute('role', 'menu');

		for (const item of config.items) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'notectl-dropdown__item';
			btn.setAttribute('role', 'menuitem');
			btn.setAttribute('tabindex', '-1');

			if (item.icon) {
				const iconSpan = document.createElement('span');
				iconSpan.className = 'notectl-dropdown__item-icon';
				iconSpan.innerHTML = item.icon;
				btn.appendChild(iconSpan);
			}

			const labelSpan = document.createElement('span');
			labelSpan.className = 'notectl-dropdown__item-label';
			labelSpan.textContent = item.label;
			btn.appendChild(labelSpan);

			btn.addEventListener('mousedown', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.context?.executeCommand(item.command);
				this.closePopup();
			});

			btn.addEventListener('click', () => {
				this.context?.executeCommand(item.command);
				this.closePopup();
			});

			container.appendChild(btn);
		}
	}

	private updateButtonStates(state: EditorState): void {
		for (const btn of this.buttons) {
			const active = btn.item.isActive?.(state) ?? false;
			const enabled = btn.item.isEnabled?.(state) ?? true;
			btn.element.setAttribute('aria-pressed', String(active));
			btn.element.classList.toggle('notectl-toolbar-btn--active', active);
			btn.element.disabled = !enabled;
			if (!enabled) {
				btn.element.setAttribute('aria-disabled', 'true');
			} else {
				btn.element.removeAttribute('aria-disabled');
			}
		}
	}
}
