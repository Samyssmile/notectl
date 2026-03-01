/**
 * ToolbarItem: describes a toolbar button registered by a plugin.
 */

import type { EditorState } from '../../state/EditorState.js';
import { isMac } from '../../view/Platform.js';
import type { PluginContext } from '../Plugin.js';
import type { PopupCloseOptions } from '../shared/PopupManager.js';

export interface GridPickerConfig {
	readonly maxRows: number;
	readonly maxCols: number;
	onSelect(rows: number, cols: number): void;
}

export interface DropdownConfig {
	readonly items: readonly { label: string; command: string; icon?: string }[];
}

export type ToolbarGroup = 'format' | 'block' | 'insert' | (string & {});
export type PopupType = 'gridPicker' | 'dropdown' | 'custom' | 'combobox';

interface ToolbarItemBase {
	readonly id: string;
	/** Grouping key: 'format' | 'insert' | 'block' or custom. */
	readonly group: ToolbarGroup;
	/** Icon content: inline SVG markup or plain text. Rendered via innerHTML. */
	readonly icon: string;
	readonly label: string;
	/** Tooltip shown on hover, e.g. "Bold (Ctrl+B)". Falls back to label. */
	readonly tooltip?: string;
	/** Command name to execute on click. */
	readonly command: string;
	/**
	 * Lower priority renders further left.
	 * @deprecated Use the declarative `toolbar` config on `createEditor()` instead.
	 */
	readonly priority?: number;
	/**
	 * When true, a visual separator is rendered after this item.
	 * @deprecated Use the declarative `toolbar` config on `createEditor()` instead.
	 */
	readonly separatorAfter?: boolean;
	isActive?(state: EditorState): boolean;
	isEnabled?(state: EditorState): boolean;
}

interface ToolbarItemNoPopup extends ToolbarItemBase {
	readonly popupType?: undefined;
}

interface ToolbarItemGridPicker extends ToolbarItemBase {
	readonly popupType: 'gridPicker';
	readonly popupConfig: GridPickerConfig;
}

interface ToolbarItemDropdown extends ToolbarItemBase {
	readonly popupType: 'dropdown';
	readonly popupConfig: DropdownConfig;
}

interface ToolbarItemCustomPopup extends ToolbarItemBase {
	readonly popupType: 'custom';
	renderPopup(
		container: HTMLElement,
		context: PluginContext,
		onClose: (options?: PopupCloseOptions) => void,
	): void;
}

export interface ToolbarItemCombobox extends Omit<ToolbarItemBase, 'icon'> {
	readonly popupType: 'combobox';
	/** Optional icon — combobox items typically display a text label instead. */
	readonly icon?: string;
	/** Pure function returning the current label text. Called on every state change. */
	getLabel(state: EditorState): string;
	/** Renders the popup content when the combobox is opened. */
	renderPopup(
		container: HTMLElement,
		context: PluginContext,
		onClose: (options?: PopupCloseOptions) => void,
	): void;
}

export type ToolbarItem =
	| ToolbarItemNoPopup
	| ToolbarItemGridPicker
	| ToolbarItemDropdown
	| ToolbarItemCustomPopup
	| ToolbarItemCombobox;

/**
 * Formats a keymap binding string into a human-readable shortcut,
 * using platform-appropriate modifier symbols (⌘ on Mac, Ctrl on others).
 *
 * @example formatShortcut('Mod-B') → "Ctrl+B" or "⌘B"
 * @example formatShortcut('Mod-Shift-X') → "Ctrl+Shift+X" or "⌘⇧X"
 */
export function formatShortcut(binding: string): string {
	if (isMac()) {
		return binding
			.replace(/Mod/g, '⌘')
			.replace(/Shift/g, '⇧')
			.replace(/Alt/g, '⌥')
			.replace(/-/g, '');
	}
	return binding.replace(/Mod/g, 'Ctrl').replace(/-/g, '+');
}
