/**
 * FontSizePlugin: registers a fontSize mark with attrs, a combobox-style
 * toolbar selector with WCAG-accessible popup, and commands for
 * increasing / decreasing font size.
 */

import { isMarkOfType } from '../../model/AttrRegistry.js';
import { getBlockMarksAtOffset, hasMark } from '../../model/Document.js';
import { isCollapsed, isNodeSelection, selectionRange } from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin, PluginContext } from '../Plugin.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface MarkAttrRegistry {
		fontSize: { size: string };
	}
}

// --- Constants ---

/** Default preset sizes shown in the font size dropdown. */
export const DEFAULT_FONT_SIZES: readonly number[] = [
	8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96,
];

const DEFAULT_FONT_SIZE = 16;
const MIN_CUSTOM_SIZE = 1;
const MAX_CUSTOM_SIZE = 400;

// --- Configuration ---

export interface FontSizeConfig {
	/**
	 * Preset sizes shown in the font size dropdown.
	 * Must contain positive integers. Values are sorted and deduplicated automatically.
	 * Defaults to {@link DEFAULT_FONT_SIZES} when omitted or empty.
	 */
	readonly sizes?: readonly number[];
	/**
	 * The base font size that text has when no fontSize mark is applied.
	 * Shown as the initial value in the toolbar combo and used as the
	 * "neutral" size — selecting it removes the mark instead of applying one.
	 * Defaults to 16.
	 */
	readonly defaultSize?: number;
	/** When true, a separator is rendered after the fontSize toolbar item. */
	readonly separatorAfter?: boolean;
}

const DEFAULT_CONFIG: FontSizeConfig = {};

// --- Plugin ---

export class FontSizePlugin implements Plugin {
	readonly id = 'fontSize';
	readonly name = 'Font Size';
	readonly priority = 21;

	private readonly config: FontSizeConfig;
	private readonly sizes: readonly number[];
	private readonly defaultSize: number;
	private context: PluginContext | null = null;
	private comboLabel: HTMLSpanElement | null = null;

	constructor(config?: Partial<FontSizeConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.sizes = resolveSizes(config?.sizes);
		this.defaultSize = resolveDefaultSize(config?.defaultSize);
	}

	init(context: PluginContext): void {
		this.context = context;
		this.registerMarkSpec(context);
		this.registerCommands(context);
		this.registerKeymaps(context);
		this.registerToolbarItem(context);
	}

	destroy(): void {
		this.context = null;
		this.comboLabel = null;
	}

	onStateChange(_oldState: EditorState, newState: EditorState, _tr: Transaction): void {
		this.updateComboLabel(newState);
	}

	// --- Schema ---

	private registerMarkSpec(context: PluginContext): void {
		context.registerMarkSpec({
			type: 'fontSize',
			rank: 4,
			attrs: {
				size: { default: '' },
			},
			toDOM(mark) {
				const span: HTMLElement = document.createElement('span');
				const size: string = mark.attrs?.size ?? '';
				if (size) {
					span.style.fontSize = size;
				}
				return span;
			},
		});
	}

	// --- Commands ---

	private registerCommands(context: PluginContext): void {
		context.registerCommand('removeFontSize', () => {
			const state: EditorState = context.getState();
			return this.removeFontSize(context, state);
		});

		context.registerCommand('setFontSize', () => {
			return false;
		});

		context.registerCommand('increaseFontSize', () => {
			const state: EditorState = context.getState();
			return this.stepFontSize(context, state, 'up');
		});

		context.registerCommand('decreaseFontSize', () => {
			const state: EditorState = context.getState();
			return this.stepFontSize(context, state, 'down');
		});
	}

	// --- Keymaps ---

	private registerKeymaps(context: PluginContext): void {
		context.registerKeymap({
			'Mod-Shift-+': () => {
				const state: EditorState = context.getState();
				return this.stepFontSize(context, state, 'up');
			},
			'Mod-Shift-_': () => {
				const state: EditorState = context.getState();
				return this.stepFontSize(context, state, 'down');
			},
		});
	}

	// --- Toolbar ---

	private registerToolbarItem(context: PluginContext): void {
		const icon: string = `<span class="notectl-font-size-select__label" data-font-size-label>${this.defaultSize}</span><span class="notectl-font-size-select__arrow">\u25BE</span>`;

		context.registerToolbarItem({
			id: 'fontSize',
			group: 'format',
			icon,
			label: 'Font Size',
			tooltip: 'Font Size',
			command: 'removeFontSize',
			priority: 6,
			popupType: 'custom',
			separatorAfter: this.config.separatorAfter,
			renderPopup: (container, ctx) => {
				this.renderFontSizePopup(container, ctx);
			},
			isActive: (state) => this.isFontSizeActive(state),
		});
	}

	private updateComboLabel(state: EditorState): void {
		if (!this.comboLabel) {
			const container: HTMLElement | undefined = this.context?.getPluginContainer('top');
			if (!container) return;
			this.comboLabel = container.querySelector<HTMLSpanElement>('[data-font-size-label]') ?? null;
			if (!this.comboLabel) return;
		}

		const activeSize: number = this.getActiveSizeNumeric(state);
		this.comboLabel.textContent = String(activeSize);
	}

	// --- State Queries ---

	private isFontSizeActive(state: EditorState): boolean {
		return this.getActiveSize(state) !== null;
	}

	private getActiveSize(state: EditorState): string | null {
		const sel = state.selection;
		if (isNodeSelection(sel)) return null;

		if (isCollapsed(sel)) {
			if (state.storedMarks) {
				const mark = state.storedMarks.find((m) => m.type === 'fontSize');
				return mark && isMarkOfType(mark, 'fontSize') ? (mark.attrs.size ?? null) : null;
			}
			const block = state.getBlock(sel.anchor.blockId);
			if (!block) return null;
			const marks = getBlockMarksAtOffset(block, sel.anchor.offset);
			const mark = marks.find((m) => m.type === 'fontSize');
			return mark && isMarkOfType(mark, 'fontSize') ? (mark.attrs.size ?? null) : null;
		}

		const block = state.getBlock(sel.anchor.blockId);
		if (!block) return null;
		const marks = getBlockMarksAtOffset(block, sel.anchor.offset);
		const mark = marks.find((m) => m.type === 'fontSize');
		return mark && isMarkOfType(mark, 'fontSize') ? (mark.attrs.size ?? null) : null;
	}

	private getActiveSizeNumeric(state: EditorState): number {
		const raw: string | null = this.getActiveSize(state);
		if (!raw) return this.defaultSize;
		const parsed: number = Number.parseInt(raw, 10);
		return Number.isNaN(parsed) ? this.defaultSize : parsed;
	}

	// --- Font Size Application ---

	private applyFontSize(context: PluginContext, state: EditorState, size: string): boolean {
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		if (isCollapsed(sel)) {
			const anchorBlock = state.getBlock(sel.anchor.blockId);
			if (!anchorBlock) return false;
			const currentMarks =
				state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
			const withoutSize = currentMarks.filter((m) => m.type !== 'fontSize');
			const newMarks = [...withoutSize, { type: markType('fontSize'), attrs: { size } }];

			const tr = state
				.transaction('command')
				.setStoredMarks(newMarks, state.storedMarks)
				.setSelection(sel)
				.build();
			context.dispatch(tr);
			return true;
		}

		const blockOrder = state.getBlockOrder();
		const range = selectionRange(sel, blockOrder);
		const builder = state.transaction('command');

		const fromIdx: number = blockOrder.indexOf(range.from.blockId);
		const toIdx: number = blockOrder.indexOf(range.to.blockId);

		const mark = { type: markType('fontSize'), attrs: { size } };

		for (let i: number = fromIdx; i <= toIdx; i++) {
			const blockId = blockOrder[i];
			if (!blockId) continue;
			const block = state.getBlock(blockId);
			if (!block) continue;
			const blockLen: number = block.children.reduce(
				(sum, c) => sum + ('text' in c ? c.text.length : 0),
				0,
			);

			const from: number = i === fromIdx ? range.from.offset : 0;
			const to: number = i === toIdx ? range.to.offset : blockLen;

			if (from !== to) {
				builder.removeMark(blockId, from, to, {
					type: markType('fontSize'),
				});
				builder.addMark(blockId, from, to, mark);
			}
		}

		builder.setSelection(sel);
		context.dispatch(builder.build());
		return true;
	}

	private removeFontSize(context: PluginContext, state: EditorState): boolean {
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		if (isCollapsed(sel)) {
			const anchorBlock = state.getBlock(sel.anchor.blockId);
			if (!anchorBlock) return false;
			const currentMarks =
				state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
			if (!hasMark(currentMarks, markType('fontSize'))) return false;

			const newMarks = currentMarks.filter((m) => m.type !== 'fontSize');
			const tr = state
				.transaction('command')
				.setStoredMarks(newMarks, state.storedMarks)
				.setSelection(sel)
				.build();
			context.dispatch(tr);
			return true;
		}

		const blockOrder = state.getBlockOrder();
		const range = selectionRange(sel, blockOrder);
		const builder = state.transaction('command');

		const fromIdx: number = blockOrder.indexOf(range.from.blockId);
		const toIdx: number = blockOrder.indexOf(range.to.blockId);

		for (let i: number = fromIdx; i <= toIdx; i++) {
			const blockId = blockOrder[i];
			if (!blockId) continue;
			const block = state.getBlock(blockId);
			if (!block) continue;
			const blockLen: number = block.children.reduce(
				(sum, c) => sum + ('text' in c ? c.text.length : 0),
				0,
			);

			const from: number = i === fromIdx ? range.from.offset : 0;
			const to: number = i === toIdx ? range.to.offset : blockLen;

			if (from !== to) {
				builder.removeMark(blockId, from, to, {
					type: markType('fontSize'),
				});
			}
		}

		builder.setSelection(sel);
		context.dispatch(builder.build());
		return true;
	}

	// --- Increase / Decrease ---

	private stepFontSize(
		context: PluginContext,
		state: EditorState,
		direction: 'up' | 'down',
	): boolean {
		const current: number = this.getActiveSizeNumeric(state);
		const next: number | null = this.getNextPresetSize(current, direction);
		if (next === null) return false;

		if (next === this.defaultSize) {
			return this.removeFontSize(context, state);
		}
		return this.applyFontSize(context, state, `${next}px`);
	}

	private getNextPresetSize(current: number, direction: 'up' | 'down'): number | null {
		if (direction === 'up') {
			for (const size of this.sizes) {
				if (size > current) return size;
			}
			return null;
		}
		for (let i: number = this.sizes.length - 1; i >= 0; i--) {
			const size: number | undefined = this.sizes[i];
			if (size !== undefined && size < current) return size;
		}
		return null;
	}

	// --- Popup Rendering ---

	private dismissPopup(): void {
		setTimeout(() => {
			document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		}, 0);
	}

	private renderFontSizePopup(container: HTMLElement, context: PluginContext): void {
		container.classList.add('notectl-font-size-picker');

		const state: EditorState = context.getState();
		const currentSize: number = this.getActiveSizeNumeric(state);
		let focusedIndex = -1;

		// --- Custom Input ---
		const inputWrapper: HTMLDivElement = document.createElement('div');
		inputWrapper.className = 'notectl-font-size-picker__input-wrapper';

		const input: HTMLInputElement = document.createElement('input');
		input.type = 'number';
		input.className = 'notectl-font-size-picker__input';
		input.min = String(MIN_CUSTOM_SIZE);
		input.max = String(MAX_CUSTOM_SIZE);
		input.value = String(currentSize);
		input.setAttribute('aria-label', 'Custom font size');

		inputWrapper.appendChild(input);
		container.appendChild(inputWrapper);

		// --- List ---
		const list: HTMLDivElement = document.createElement('div');
		list.className = 'notectl-font-size-picker__list';
		list.setAttribute('role', 'listbox');
		list.setAttribute('aria-label', 'Font sizes');

		const items: HTMLButtonElement[] = [];

		for (let idx = 0; idx < this.sizes.length; idx++) {
			const size: number | undefined = this.sizes[idx];
			if (size === undefined) continue;
			const isActive: boolean = size === currentSize;
			const itemId: string = `notectl-font-size-option-${size}`;

			const item: HTMLButtonElement = document.createElement('button');
			item.type = 'button';
			item.id = itemId;
			item.className = 'notectl-font-size-picker__item';
			item.setAttribute('role', 'option');
			item.setAttribute('aria-selected', String(isActive));

			if (isActive) {
				item.classList.add('notectl-font-size-picker__item--active');
			}

			const check: HTMLSpanElement = document.createElement('span');
			check.className = 'notectl-font-size-picker__check';
			check.textContent = isActive ? '\u2713' : '';
			item.appendChild(check);

			const label: HTMLSpanElement = document.createElement('span');
			label.className = 'notectl-font-size-picker__label';
			label.textContent = String(size);
			item.appendChild(label);

			item.addEventListener('mousedown', (e: MouseEvent) => {
				e.preventDefault();
				e.stopPropagation();
				this.selectSize(context, size);
				this.dismissPopup();
			});

			items.push(item);
			list.appendChild(item);
		}

		container.appendChild(list);

		// --- Scroll active item into view ---
		const activeIdx: number = this.sizes.indexOf(currentSize);
		if (activeIdx >= 0) {
			const activeItem: HTMLButtonElement | undefined = items[activeIdx];
			if (activeItem) {
				requestAnimationFrame(() => {
					activeItem.scrollIntoView({ block: 'nearest' });
				});
				list.setAttribute('aria-activedescendant', activeItem.id);
			}
		}

		// --- Keyboard helpers ---
		const setFocusedIndex = (idx: number): void => {
			if (focusedIndex >= 0 && focusedIndex < items.length) {
				items[focusedIndex]?.classList.remove('notectl-font-size-picker__item--focused');
			}
			focusedIndex = idx;
			const focused: HTMLButtonElement | undefined = items[focusedIndex];
			if (focusedIndex >= 0 && focusedIndex < items.length && focused) {
				focused.classList.add('notectl-font-size-picker__item--focused');
				focused.scrollIntoView({ block: 'nearest' });
				list.setAttribute('aria-activedescendant', focused.id);
			}
		};

		// --- Input Events ---
		input.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const val: number = Number.parseInt(input.value, 10);
				if (!Number.isNaN(val) && val >= MIN_CUSTOM_SIZE && val <= MAX_CUSTOM_SIZE) {
					this.selectSize(context, val);
					this.dismissPopup();
				}
			} else if (e.key === 'ArrowDown') {
				e.preventDefault();
				setFocusedIndex(0);
				items[0]?.focus();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this.dismissPopup();
			}
		});

		// --- List Keyboard Navigation ---
		list.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				if (focusedIndex < items.length - 1) {
					setFocusedIndex(focusedIndex + 1);
					items[focusedIndex]?.focus();
				}
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				if (focusedIndex > 0) {
					setFocusedIndex(focusedIndex - 1);
					items[focusedIndex]?.focus();
				} else {
					setFocusedIndex(-1);
					input.focus();
				}
			} else if (e.key === 'Enter') {
				e.preventDefault();
				const selectedSize: number | undefined = this.sizes[focusedIndex];
				if (focusedIndex >= 0 && focusedIndex < this.sizes.length && selectedSize !== undefined) {
					this.selectSize(context, selectedSize);
					this.dismissPopup();
				}
			} else if (e.key === 'Escape') {
				e.preventDefault();
				this.dismissPopup();
			}
		});
	}

	private selectSize(context: PluginContext, size: number): void {
		if (size === this.defaultSize) {
			context.executeCommand('removeFontSize');
		} else {
			this.applyFontSize(context, context.getState(), `${size}px`);
		}
	}
}

// --- Helpers ---

function resolveSizes(sizes: readonly number[] | undefined): readonly number[] {
	if (!sizes || sizes.length === 0) return DEFAULT_FONT_SIZES;
	const unique: number[] = [...new Set(sizes)].filter((n) => Number.isInteger(n) && n > 0);
	unique.sort((a, b) => a - b);
	return unique.length > 0 ? unique : DEFAULT_FONT_SIZES;
}

function resolveDefaultSize(size: number | undefined): number {
	if (size === undefined) return DEFAULT_FONT_SIZE;
	return Number.isInteger(size) && size > 0 ? size : DEFAULT_FONT_SIZE;
}
