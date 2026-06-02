/**
 * HighlightPlugin: registers a highlight (background-color) mark with attrs,
 * toolbar button with a color picker popup, and removeHighlight command.
 */

import { COLOR_PICKER_CSS } from '../../editor/styles/color-picker.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { isColorMarkActive, removeColorMark } from '../shared/ColorMarkOperations.js';
import { renderColorPickerPopup } from '../shared/ColorPickerPopup.js';
import { isValidCSSColor, resolveColors } from '../shared/ColorValidation.js';
import { createInlineStyleMarkSpec } from '../shared/InlineStyleMarkSpec.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import {
	HIGHLIGHT_LOCALE_EN,
	type HighlightLocale,
	loadHighlightLocale,
} from './HighlightLocale.js';
import { HIGHLIGHT_PALETTE } from './HighlightPalette.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface MarkAttrRegistry {
		highlight: { color: string };
	}
}

// --- Configuration ---

export interface HighlightConfig {
	/**
	 * Restricts the color picker to a specific set of hex colors.
	 * Each value must be a valid hex color code (`#RGB` or `#RRGGBB`).
	 * Duplicates are removed automatically (case-insensitive).
	 * When omitted, the full default palette is shown.
	 */
	readonly colors?: readonly string[];
	readonly locale?: HighlightLocale;
}

// --- Plugin ---

export class HighlightPlugin implements Plugin {
	readonly id = 'highlight';
	readonly name = 'Highlight';
	readonly priority = 24;

	private readonly config: HighlightConfig;
	private readonly colors: readonly string[];
	private locale!: HighlightLocale;

	constructor(config?: Partial<HighlightConfig>) {
		this.config = { ...config };
		this.colors = resolveColors(config?.colors, HIGHLIGHT_PALETTE, 'HighlightPlugin');
	}

	async init(context: PluginContext): Promise<void> {
		this.locale = await resolveLocale(
			context,
			this.config.locale,
			HIGHLIGHT_LOCALE_EN,
			loadHighlightLocale,
		);

		context.registerStyleSheet(COLOR_PICKER_CSS);
		this.registerMarkSpec(context);
		this.registerCommands(context);
		this.registerToolbarItem(context);
	}

	private registerMarkSpec(context: PluginContext): void {
		context.registerMarkSpec(
			createInlineStyleMarkSpec({
				type: 'highlight',
				rank: 4,
				valueAttr: 'color',
				domStyleProperty: 'backgroundColor',
				cssProperty: 'background-color',
				validate: isValidCSSColor,
				validateOnParse: true,
			}),
		);
	}

	private registerCommands(context: PluginContext): void {
		context.registerCommand('removeHighlight', () => {
			return removeColorMark(context, context.getState(), 'highlight');
		});
	}

	private registerToolbarItem(context: PluginContext): void {
		const pathD =
			'M11 3L5.5 17h2.25l1.12-3h6.25l1.12 3h2.25L13 3h-2z' + 'm-1.38 9L12 5.67 14.38 12H9.62z';
		const icon: string = [
			'<svg xmlns="http://www.w3.org/2000/svg"',
			' viewBox="0 0 24 24">',
			`<path d="${pathD}"/>`,
			'<rect x="3" y="17" width="18" height="6"',
			' rx="0.5" fill="#fff176"/>',
			'</svg>',
		].join('');

		context.registerToolbarItem({
			id: 'highlight',
			group: 'format',
			icon,
			label: this.locale.label,
			tooltip: this.locale.tooltip,
			command: 'removeHighlight',
			popupType: 'custom',
			renderPopup: (container, ctx, onClose) => {
				renderColorPickerPopup(container, ctx, {
					markType: 'highlight',
					colors: this.colors,
					columns: 10,
					resetLabel: this.locale.resetLabel,
					resetCommand: 'removeHighlight',
					ariaLabelPrefix: this.locale.ariaLabelPrefix,
					onClose,
				});
			},
			isActive: (state: EditorState) => isColorMarkActive(state, 'highlight'),
		});
	}
}
