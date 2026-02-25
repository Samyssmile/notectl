/**
 * Block type picker entries and toolbar dropdown for heading block types.
 * Registers picker entries for paragraph, title, subtitle, and all heading levels,
 * plus a combobox-style toolbar item with a custom popup.
 */

import { isGapCursor, isNodeSelection } from '../../model/Selection.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import { ToolbarServiceKey } from '../toolbar/ToolbarPlugin.js';
import type { PickerEntryStyle } from './BlockTypePickerEntry.js';
import type { HeadingLocale } from './HeadingLocale.js';
import type { HeadingConfig, HeadingLevel } from './HeadingPlugin.js';

// --- Picker Entry Registration ---

/** Registers block type picker entries for paragraph, title, subtitle, and heading levels. */
export function registerHeadingPickerEntries(
	context: PluginContext,
	config: HeadingConfig,
	locale: HeadingLocale,
): void {
	context.registerBlockTypePickerEntry({
		id: 'paragraph',
		label: locale.paragraph,
		command: 'setParagraph',
		priority: 10,
		isActive: (state) => {
			if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return false;
			const block = state.getBlock(state.selection.anchor.blockId);
			return block?.type === 'paragraph';
		},
	});

	context.registerBlockTypePickerEntry({
		id: 'title',
		label: locale.title,
		command: 'setTitle',
		priority: 20,
		style: { fontSize: '1.6em', fontWeight: '700' },
		isActive: (state) => {
			if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return false;
			const block = state.getBlock(state.selection.anchor.blockId);
			return block?.type === 'title';
		},
	});

	context.registerBlockTypePickerEntry({
		id: 'subtitle',
		label: locale.subtitle,
		command: 'setSubtitle',
		priority: 30,
		style: { fontSize: '1.3em', fontWeight: '500' },
		isActive: (state) => {
			if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return false;
			const block = state.getBlock(state.selection.anchor.blockId);
			return block?.type === 'subtitle';
		},
	});

	for (const level of config.levels) {
		context.registerBlockTypePickerEntry({
			id: `heading-${level}`,
			label: getHeadingLabel(locale, level),
			command: `setHeading${level}`,
			priority: 100 + level,
			style: { fontSize: `${1.4 - level * 0.1}em`, fontWeight: '600' },
			isActive: (state) => {
				if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return false;
				const block = state.getBlock(state.selection.anchor.blockId);
				return block?.type === 'heading' && block.attrs?.level === level;
			},
		});
	}
}

// --- Toolbar Item ---

/** Registers the heading toolbar dropdown with a custom picker popup. */
export function registerHeadingToolbarItem(
	context: PluginContext,
	config: HeadingConfig,
	locale: HeadingLocale,
): void {
	const icon: string = `<span class="notectl-heading-select__label" data-heading-label>${locale.paragraph}</span><span class="notectl-heading-select__arrow">\u25BE</span>`;

	context.registerToolbarItem({
		id: 'heading',
		group: 'block',
		icon,
		label: locale.blockTypeLabel,
		tooltip: locale.blockTypeLabel,
		command: 'setParagraph',
		priority: 50,
		popupType: 'custom',
		separatorAfter: config.separatorAfter,
		renderPopup: (container, ctx) => {
			renderHeadingPopup(container, ctx, locale);
		},
		isActive: (state) => {
			const entries = context.getSchemaRegistry().getBlockTypePickerEntries();
			return entries.some((entry) => entry.id !== 'paragraph' && entry.isActive(state));
		},
	});
}

// --- Combo Label Update ---

/**
 * Updates the combobox label in the toolbar to reflect the current block type.
 * Returns the resolved HTMLSpanElement (cached across calls) for reuse.
 */
export function updateComboLabel(
	state: EditorState,
	context: PluginContext,
	locale: HeadingLocale,
	cachedLabel: HTMLSpanElement | null,
): HTMLSpanElement | null {
	let label: HTMLSpanElement | null = cachedLabel;

	if (!label) {
		const container: HTMLElement | undefined = context.getPluginContainer('top');
		if (!container) return null;
		label = container.querySelector<HTMLSpanElement>('[data-heading-label]') ?? null;
		if (!label) return null;
	}

	label.textContent = getActiveLabel(state, context, locale);
	return label;
}

// --- Popup Rendering ---

function renderHeadingPopup(
	container: HTMLElement,
	context: PluginContext,
	locale: HeadingLocale,
): void {
	container.classList.add('notectl-heading-picker');

	const state: EditorState = context.getState();
	if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return;

	const list: HTMLDivElement = document.createElement('div');
	list.className = 'notectl-heading-picker__list';
	list.setAttribute('role', 'listbox');
	list.setAttribute('aria-label', locale.blockTypesAria);

	const entries = context.getSchemaRegistry().getBlockTypePickerEntries();
	for (const entry of entries) {
		const active: boolean = entry.isActive(state);
		list.appendChild(
			createPickerItem(
				entry.label,
				active,
				(e: MouseEvent) => {
					e.preventDefault();
					e.stopPropagation();
					context.executeCommand(entry.command);
					const toolbar = context.getService(ToolbarServiceKey);
					toolbar?.closePopup();
				},
				entry.style,
			),
		);
	}

	container.appendChild(list);
}

function createPickerItem(
	label: string,
	isActive: boolean,
	handler: (e: MouseEvent) => void,
	style?: PickerEntryStyle,
): HTMLButtonElement {
	const item: HTMLButtonElement = document.createElement('button');
	item.type = 'button';
	item.className = 'notectl-heading-picker__item';
	item.setAttribute('role', 'option');
	item.setAttribute('aria-selected', String(isActive));

	if (isActive) {
		item.classList.add('notectl-heading-picker__item--active');
	}

	const check: HTMLSpanElement = document.createElement('span');
	check.className = 'notectl-heading-picker__check';
	check.textContent = isActive ? '\u2713' : '';
	item.appendChild(check);

	const labelSpan: HTMLSpanElement = document.createElement('span');
	labelSpan.className = 'notectl-heading-picker__label';
	labelSpan.textContent = label;
	if (style) {
		labelSpan.style.fontSize = style.fontSize;
		labelSpan.style.fontWeight = style.fontWeight;
	}
	item.appendChild(labelSpan);

	item.addEventListener('mousedown', handler);
	return item;
}

// --- Helpers ---

function getHeadingLabel(locale: HeadingLocale, level: HeadingLevel): string {
	const key = `heading${level}` as keyof HeadingLocale;
	return locale[key] as string;
}

function getActiveLabel(state: EditorState, context: PluginContext, locale: HeadingLocale): string {
	if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return locale.paragraph;
	const entries = context.getSchemaRegistry().getBlockTypePickerEntries();
	for (const entry of entries) {
		if (entry.isActive(state)) return entry.label;
	}
	return locale.paragraph;
}
