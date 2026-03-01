/**
 * Block type picker entries and toolbar dropdown for heading block types.
 * Registers picker entries for paragraph, title, subtitle, and all heading levels,
 * plus a combobox-style toolbar item with a custom popup.
 */

import { isGapCursor, isNodeSelection } from '../../model/Selection.js';
import type { EditorState } from '../../state/EditorState.js';
import { setStyleProperties } from '../../style/StyleRuntime.js';
import type { PluginContext } from '../Plugin.js';
import type { PopupCloseOptions } from '../shared/PopupManager.js';
import type { PickerEntryStyle } from './BlockTypePickerEntry.js';
import type { HeadingLocale } from './HeadingLocale.js';
import type { HeadingConfig } from './HeadingPlugin.js';
import type { HeadingLevel } from './HeadingPlugin.js';

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

/** Registers the heading toolbar dropdown with a combobox picker popup. */
export function registerHeadingToolbarItem(
	context: PluginContext,
	config: HeadingConfig,
	locale: HeadingLocale,
): void {
	context.registerToolbarItem({
		id: 'heading',
		group: 'block',
		label: locale.blockTypeLabel,
		tooltip: locale.blockTypeLabel,
		command: 'setParagraph',
		priority: 50,
		popupType: 'combobox',
		separatorAfter: config.separatorAfter,
		getLabel: (state: EditorState): string => getActiveLabel(state, context, locale),
		renderPopup: (container, ctx, onClose) => {
			renderHeadingPopup(container, ctx, locale, onClose);
		},
		isActive: (state) => {
			const entries = context.getBlockTypePickerRegistry().getBlockTypePickerEntries();
			return entries.some((entry) => entry.id !== 'paragraph' && entry.isActive(state));
		},
	});
}

// --- Popup Rendering ---

function renderHeadingPopup(
	container: HTMLElement,
	context: PluginContext,
	locale: HeadingLocale,
	onClose: (options?: PopupCloseOptions) => void,
): void {
	container.classList.add('notectl-heading-picker');

	const state: EditorState = context.getState();
	if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return;

	const contentElement: HTMLElement = context.getContainer();

	const list: HTMLDivElement = document.createElement('div');
	list.className = 'notectl-heading-picker__list';
	list.setAttribute('role', 'listbox');
	list.setAttribute('aria-label', locale.blockTypesAria);

	const entries = context.getBlockTypePickerRegistry().getBlockTypePickerEntries();
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
					onClose({ restoreFocusTo: contentElement });
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
		setStyleProperties(labelSpan, {
			fontSize: style.fontSize,
			fontWeight: style.fontWeight,
		});
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
	const entries = context.getBlockTypePickerRegistry().getBlockTypePickerEntries();
	for (const entry of entries) {
		if (entry.isActive(state)) return entry.label;
	}
	return locale.paragraph;
}
