/**
 * Renders the font-size picker popup with a custom numeric input
 * and an accessible preset list with keyboard navigation.
 */

import type { PluginContext } from '../Plugin.js';
import type { PopupCloseOptions } from '../shared/PopupManager.js';
import type { FontSizeLocale } from './FontSizeLocale.js';
import { getActiveSizeNumeric, selectSize } from './FontSizeOperations.js';

// --- Constants ---

const MIN_CUSTOM_SIZE = 1;
const MAX_CUSTOM_SIZE = 400;

// --- Config ---

export interface FontSizePopupConfig {
	readonly sizes: readonly number[];
	readonly defaultSize: number;
	readonly onClose: (options?: PopupCloseOptions) => void;
	readonly contentElement: HTMLElement;
	readonly locale?: FontSizeLocale;
}

// --- Public Entry Point ---

/** Builds the font-size picker DOM inside the given container. */
export function renderFontSizePopup(
	container: HTMLElement,
	context: PluginContext,
	config: FontSizePopupConfig,
): void {
	container.classList.add('notectl-font-size-picker');

	const currentSize: number = getActiveSizeNumeric(context.getState(), config.defaultSize);

	const input: HTMLInputElement = buildCustomInput(currentSize, config);
	appendInputWrapper(container, input);

	const { list, items } = buildSizeList(config.sizes, currentSize, context, config);
	container.appendChild(list);

	scrollActiveIntoView(items, config.sizes, currentSize, list);
	attachKeyboardNavigation(input, list, items, context, config);
}

// --- Custom Input ---

function buildCustomInput(currentSize: number, config: FontSizePopupConfig): HTMLInputElement {
	const input: HTMLInputElement = document.createElement('input');
	input.type = 'number';
	input.className = 'notectl-font-size-picker__input';
	input.min = String(MIN_CUSTOM_SIZE);
	input.max = String(MAX_CUSTOM_SIZE);
	input.value = String(currentSize);
	input.setAttribute('aria-label', config.locale?.customFontSizeAria ?? 'Custom font size');
	return input;
}

function appendInputWrapper(container: HTMLElement, input: HTMLInputElement): void {
	const wrapper: HTMLDivElement = document.createElement('div');
	wrapper.className = 'notectl-font-size-picker__input-wrapper';
	wrapper.appendChild(input);
	container.appendChild(wrapper);
}

// --- Size List ---

interface SizeListResult {
	readonly list: HTMLDivElement;
	readonly items: HTMLButtonElement[];
}

function buildSizeList(
	sizes: readonly number[],
	currentSize: number,
	context: PluginContext,
	config: FontSizePopupConfig,
): SizeListResult {
	const list: HTMLDivElement = document.createElement('div');
	list.className = 'notectl-font-size-picker__list';
	list.setAttribute('role', 'listbox');
	list.setAttribute('aria-label', config.locale?.fontSizesAria ?? 'Font sizes');

	const items: HTMLButtonElement[] = [];

	for (const size of sizes) {
		const isActive: boolean = size === currentSize;
		const item: HTMLButtonElement = buildSizeItem(size, isActive);

		item.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			selectSize(context, size, config.defaultSize);
			config.onClose({ restoreFocusTo: config.contentElement });
		});

		items.push(item);
		list.appendChild(item);
	}

	return { list, items };
}

function buildSizeItem(size: number, isActive: boolean): HTMLButtonElement {
	const item: HTMLButtonElement = document.createElement('button');
	item.type = 'button';
	item.id = `notectl-font-size-option-${size}`;
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

	return item;
}

// --- Scroll ---

function scrollActiveIntoView(
	items: HTMLButtonElement[],
	sizes: readonly number[],
	currentSize: number,
	list: HTMLDivElement,
): void {
	const activeIdx: number = sizes.indexOf(currentSize);
	if (activeIdx < 0) return;

	const activeItem: HTMLButtonElement | undefined = items[activeIdx];
	if (!activeItem) return;

	requestAnimationFrame(() => {
		activeItem.scrollIntoView({ block: 'nearest' });
	});
	list.setAttribute('aria-activedescendant', activeItem.id);
}

// --- Keyboard Navigation ---

function attachKeyboardNavigation(
	input: HTMLInputElement,
	list: HTMLDivElement,
	items: HTMLButtonElement[],
	context: PluginContext,
	config: FontSizePopupConfig,
): void {
	let focusedIndex = -1;

	const setFocused = (idx: number): void => {
		if (focusedIndex >= 0 && focusedIndex < items.length) {
			items[focusedIndex]?.classList.remove('notectl-font-size-picker__item--focused');
		}
		focusedIndex = idx;
		const el: HTMLButtonElement | undefined = items[focusedIndex];
		if (focusedIndex >= 0 && focusedIndex < items.length && el) {
			el.classList.add('notectl-font-size-picker__item--focused');
			el.scrollIntoView({ block: 'nearest' });
			list.setAttribute('aria-activedescendant', el.id);
		}
	};

	input.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			const val: number = Number.parseInt(input.value, 10);
			if (!Number.isNaN(val) && val >= MIN_CUSTOM_SIZE && val <= MAX_CUSTOM_SIZE) {
				selectSize(context, val, config.defaultSize);
				config.onClose({ restoreFocusTo: config.contentElement });
			}
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			setFocused(0);
			items[0]?.focus();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			config.onClose({ restoreFocusTo: config.contentElement });
		}
	});

	list.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (focusedIndex < items.length - 1) {
				setFocused(focusedIndex + 1);
				items[focusedIndex]?.focus();
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (focusedIndex > 0) {
				setFocused(focusedIndex - 1);
				items[focusedIndex]?.focus();
			} else {
				setFocused(-1);
				input.focus();
			}
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const selectedSize: number | undefined = config.sizes[focusedIndex];
			if (focusedIndex >= 0 && focusedIndex < config.sizes.length && selectedSize !== undefined) {
				selectSize(context, selectedSize, config.defaultSize);
				config.onClose({ restoreFocusTo: config.contentElement });
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			config.onClose({ restoreFocusTo: config.contentElement });
		}
	});
}
