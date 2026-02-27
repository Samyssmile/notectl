/**
 * Shared color picker popup rendering with WAI-ARIA grid keyboard navigation.
 * Used by TextColorPlugin and HighlightPlugin.
 * Delegates grid rendering to the shared ColorGrid module.
 */

import type { MarkAttrRegistry } from '../../model/AttrRegistry.js';
import type { PluginContext } from '../Plugin.js';
import { renderColorGrid } from './ColorGrid.js';
import { applyColorMark, getActiveColor } from './ColorMarkOperations.js';

/** Color mark type names that have `{ color: string }` attrs. */
type ColorMarkType = {
	[K in keyof MarkAttrRegistry]: MarkAttrRegistry[K] extends { color: string } ? K : never;
}[keyof MarkAttrRegistry];

/** Configuration for `renderColorPickerPopup`. */
export interface ColorPickerConfig {
	readonly markType: ColorMarkType;
	readonly colors: readonly string[];
	readonly columns: number;
	readonly resetLabel: string;
	readonly resetCommand: string;
	readonly ariaLabelPrefix: string;
	readonly onClose: () => void;
}

const COLUMNS = 10;

/**
 * Renders an accessible color picker popup into `container`.
 *
 * Features:
 * - WAI-ARIA `role="grid"` with row/gridcell structure
 * - Arrow key navigation (wraps around, clamps on partial last row)
 * - Enter/Space selects color and closes popup
 * - Escape closes popup
 * - Roving tabindex on swatches
 */
export function renderColorPickerPopup(
	container: HTMLElement,
	context: PluginContext,
	config: ColorPickerConfig,
): void {
	container.classList.add('notectl-color-picker');

	const state = context.getState();
	const activeColor: string | null = getActiveColor(state, config.markType);
	const columns: number = config.columns || COLUMNS;

	// --- Reset button ---
	const resetBtn: HTMLButtonElement = document.createElement('button');
	resetBtn.type = 'button';
	resetBtn.className = 'notectl-color-picker__default';
	resetBtn.textContent = config.resetLabel;
	resetBtn.addEventListener('mousedown', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		context.executeCommand(config.resetCommand);
		config.onClose();
	});
	resetBtn.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			config.onClose();
		}
	});
	container.appendChild(resetBtn);

	// --- Color grid (delegated to shared ColorGrid) ---
	renderColorGrid(container, {
		colors: config.colors,
		columns,
		ariaLabel: `${config.ariaLabelPrefix} color picker`,
		ariaLabelPrefix: config.ariaLabelPrefix,
		activeColor,
		onSelect: (color: string) => {
			applyColorMark(context, context.getState(), config.markType, color);
			config.onClose();
		},
		onClose: config.onClose,
	});
}
