/**
 * Toolbar plugin: renders toolbar items registered by other plugins.
 * Acts as a pure rendering engine — has no knowledge of specific features.
 * Supports buttons, dropdowns, grid pickers, and custom popups.
 * Implements WAI-ARIA Toolbar pattern with roving tabindex.
 */

import { TOOLBAR_CSS } from '../../editor/styles/toolbar.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { ServiceKey } from '../Plugin.js';
import type { Plugin, PluginConfig, PluginContext } from '../Plugin.js';
import type { ToolbarItem } from './ToolbarItem.js';
import {
	applyRovingTabindex,
	findFirstEnabled,
	findLastEnabled,
	findNextEnabled,
} from './ToolbarKeyboardNav.js';
import { ToolbarPopupController } from './ToolbarPopupController.js';
import { createSeparator } from './ToolbarRenderers.js';
import { ToolbarTooltip } from './ToolbarTooltip.js';

// --- Layout Config ---

export interface ToolbarLayoutConfig {
	readonly groups: ReadonlyArray<ReadonlyArray<string>>;
}

// --- Typed Service API ---

export interface ToolbarServiceAPI {
	/** Re-reads isActive/isEnabled from state and updates all buttons. */
	refresh(): void;
	/** Closes the currently open popup, if any. */
	closePopup(): void;
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
	private readonly hiddenItems = new Set<string>();
	private readonly layoutConfig: ToolbarLayoutConfig | null;
	private focusedIndex = 0;
	private tooltip: ToolbarTooltip | null = null;
	private popupController: ToolbarPopupController | null = null;

	constructor(layoutConfig?: ToolbarLayoutConfig) {
		this.layoutConfig = layoutConfig ?? null;
	}

	init(context: PluginContext): void {
		context.registerStyleSheet(TOOLBAR_CSS);
		this.context = context;

		this.popupController = new ToolbarPopupController(() => this.getActiveElement());
		this.tooltip = new ToolbarTooltip(() => this.popupController?.isOpen() ?? false);

		context.registerService(ToolbarServiceKey, {
			refresh: () => this.updateButtonStates(context.getState()),
			closePopup: () => this.popupController?.close(),
		});

		this.createToolbarElement();
	}

	onReady(): void {
		this.renderItems();
	}

	destroy(): void {
		this.popupController?.destroy();
		this.popupController = null;
		this.tooltip?.destroy();
		this.tooltip = null;
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

	// --- Toolbar ---

	private createToolbarElement(): void {
		if (!this.context) return;

		if (this.toolbarElement) {
			this.toolbarElement.remove();
		}
		this.buttons = [];

		const container: HTMLElement = this.context.getPluginContainer('top');
		this.toolbarElement = document.createElement('div');
		this.toolbarElement.setAttribute('role', 'toolbar');
		this.toolbarElement.setAttribute('aria-label', 'Formatting options');
		this.toolbarElement.className = 'notectl-toolbar';

		this.toolbarElement.addEventListener('keydown', (e) => this.handleToolbarKeydown(e));

		container.appendChild(this.toolbarElement);
	}

	private renderItems(): void {
		if (!this.context || !this.toolbarElement) return;

		for (const btn of this.buttons) {
			btn.element.remove();
		}
		this.buttons = [];

		for (const sep of this.toolbarElement.querySelectorAll('.notectl-toolbar-separator')) {
			sep.remove();
		}

		if (this.layoutConfig) {
			this.renderItemsByLayout();
		} else {
			this.renderItemsByPriority();
		}

		if (this.buttons.length > 0 && !this.toolbarElement.parentElement) {
			const container: HTMLElement = this.context.getPluginContainer('top');
			container.appendChild(this.toolbarElement);
		}

		this.initRovingTabindex();
		this.updateButtonStates(this.context.getState());
	}

	// --- Roving Tabindex ---

	private initRovingTabindex(): void {
		const elements: HTMLButtonElement[] = this.buttons.map((b) => b.element);
		const first: number = findFirstEnabled(elements);
		this.focusedIndex = first >= 0 ? first : 0;
		applyRovingTabindex(elements, this.focusedIndex);
	}

	private setRovingFocus(index: number): void {
		if (index < 0 || index >= this.buttons.length) return;
		this.focusedIndex = index;
		const elements: HTMLButtonElement[] = this.buttons.map((b) => b.element);
		applyRovingTabindex(elements, index);
		elements[index]?.focus();
	}

	/** Returns the active element, respecting shadow DOM boundaries. */
	private getActiveElement(): Element | null {
		const root: Node | undefined = this.toolbarElement?.getRootNode();
		if (root instanceof ShadowRoot) {
			return root.activeElement;
		}
		return document.activeElement;
	}

	private syncFocusedIndex(): void {
		const active: Element | null = this.getActiveElement();
		const idx: number = this.buttons.findIndex((b) => b.element === active);
		if (idx >= 0) {
			this.focusedIndex = idx;
		}
	}

	// --- Toolbar Keyboard ---

	private handleToolbarKeydown(e: KeyboardEvent): void {
		const elements: HTMLButtonElement[] = this.buttons.map((b) => b.element);
		if (elements.length === 0) return;

		this.syncFocusedIndex();

		switch (e.key) {
			case 'ArrowRight': {
				e.preventDefault();
				const next: number = findNextEnabled(elements, this.focusedIndex, 1);
				this.setRovingFocus(next);
				break;
			}
			case 'ArrowLeft': {
				e.preventDefault();
				const prev: number = findNextEnabled(elements, this.focusedIndex, -1);
				this.setRovingFocus(prev);
				break;
			}
			case 'Home': {
				e.preventDefault();
				const first: number = findFirstEnabled(elements);
				if (first >= 0) this.setRovingFocus(first);
				break;
			}
			case 'End': {
				e.preventDefault();
				const last: number = findLastEnabled(elements);
				if (last >= 0) this.setRovingFocus(last);
				break;
			}
			case 'Enter':
			case ' ': {
				e.preventDefault();
				const btn: ToolbarButton | undefined = this.buttons[this.focusedIndex];
				if (btn) this.activateButton(btn.element, btn.item);
				break;
			}
		}
	}

	/** Activates a toolbar button (shared between mouse click and keyboard). */
	private activateButton(btn: HTMLButtonElement, item: ToolbarItem): void {
		this.tooltip?.hide();
		if (item.popupType && this.context) {
			this.popupController?.toggle(btn, item, this.context);
		} else {
			this.context?.executeCommand(item.command);
		}
	}

	// --- Layout Rendering ---

	private renderItemsByLayout(): void {
		if (!this.context || !this.toolbarElement || !this.layoutConfig) return;

		const registry = this.context.getSchemaRegistry();
		let firstGroup = true;

		for (const groupPluginIds of this.layoutConfig.groups) {
			const groupItems: ToolbarItem[] = [];
			for (const pId of groupPluginIds) {
				const items: ToolbarItem[] = registry
					.getToolbarItemsByPlugin(pId)
					.filter((item) => !this.hiddenItems.has(item.id));
				items.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
				groupItems.push(...items);
			}

			if (groupItems.length === 0) continue;

			if (!firstGroup) {
				this.toolbarElement.appendChild(createSeparator());
			}
			firstGroup = false;

			for (const item of groupItems) {
				const btn: ToolbarButton = this.createButton(item);
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
		const items: ToolbarItem[] = registry
			.getToolbarItems()
			.filter((item) => !this.hiddenItems.has(item.id));
		if (items.length === 0) {
			this.toolbarElement.remove();
			return;
		}

		const sorted: ToolbarItem[] = [...items].sort(
			(a, b) => (a.priority ?? 100) - (b.priority ?? 100),
		);

		const hasSeparatorAfter: boolean = sorted.some((item) => item.separatorAfter);

		if (hasSeparatorAfter) {
			for (let i = 0; i < sorted.length; i++) {
				const item: ToolbarItem | undefined = sorted[i];
				if (!item) continue;
				const btn: ToolbarButton = this.createButton(item);
				this.toolbarElement.appendChild(btn.element);
				this.buttons.push(btn);

				if (item.separatorAfter && i < sorted.length - 1) {
					this.toolbarElement.appendChild(createSeparator());
				}
			}
		} else {
			const groups = new Map<string, ToolbarItem[]>();
			for (const item of sorted) {
				const list: ToolbarItem[] = groups.get(item.group) ?? [];
				list.push(item);
				groups.set(item.group, list);
			}

			let firstGroup = true;
			for (const [, groupItems] of groups) {
				if (!firstGroup) {
					this.toolbarElement.appendChild(createSeparator());
				}
				firstGroup = false;

				for (const item of groupItems) {
					const btn: ToolbarButton = this.createButton(item);
					this.toolbarElement.appendChild(btn.element);
					this.buttons.push(btn);
				}
			}
		}
	}

	// --- Button Creation ---

	private createButton(item: ToolbarItem): ToolbarButton {
		const btn: HTMLButtonElement = document.createElement('button');
		btn.type = 'button';
		btn.className = `notectl-toolbar-btn notectl-toolbar-btn--${item.id}`;
		btn.setAttribute('aria-pressed', 'false');
		btn.setAttribute('aria-label', item.label);
		btn.setAttribute('data-toolbar-item', item.id);
		btn.setAttribute('data-tooltip', item.tooltip ?? item.label);

		if (item.popupType) {
			btn.setAttribute('aria-haspopup', 'true');
			btn.setAttribute('aria-expanded', 'false');
		}

		const span: HTMLSpanElement = document.createElement('span');
		span.className = 'notectl-toolbar-btn__icon';
		span.innerHTML = item.icon;
		btn.appendChild(span);

		btn.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			this.activateButton(btn, item);
		});

		btn.addEventListener('mouseenter', () => this.tooltip?.show(btn));
		btn.addEventListener('mouseleave', () => this.tooltip?.hide());
		btn.addEventListener('focus', () => this.tooltip?.show(btn));
		btn.addEventListener('blur', () => this.tooltip?.hide());

		return { element: btn, item };
	}

	// --- Button State Updates ---

	private updateButtonStates(state: EditorState): void {
		for (const btn of this.buttons) {
			const active: boolean = btn.item.isActive?.(state) ?? false;
			const enabled: boolean = btn.item.isEnabled?.(state) ?? true;
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
