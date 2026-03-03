/**
 * ToolbarItem: describes a toolbar button registered by a plugin.
 */

import type { EditorState } from '../../state/EditorState.js';
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
	isActive?(state: EditorState): boolean;
	isEnabled?(state: EditorState): boolean;
	/** Optional dynamic icon callback. When provided, icon updates on every state change. */
	getIcon?(state: EditorState): string;
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
