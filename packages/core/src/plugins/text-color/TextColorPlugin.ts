/**
 * TextColorPlugin: registers a text color mark with attrs,
 * toolbar button with a color picker popup, and removeTextColor command.
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
	TEXT_COLOR_LOCALE_EN,
	type TextColorLocale,
	loadTextColorLocale,
} from './TextColorLocale.js';
import { COLOR_PALETTE } from './TextColorPalette.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface MarkAttrRegistry {
		textColor: { color: string };
	}
}

// --- Configuration ---

export interface TextColorConfig {
	/**
	 * Restricts the color picker to a specific set of hex colors.
	 * Each value must be a valid hex color code (`#RGB` or `#RRGGBB`).
	 * Duplicates are removed automatically (case-insensitive).
	 * When omitted, the full default palette is shown.
	 */
	readonly colors?: readonly string[];
	readonly locale?: TextColorLocale;
}

// --- Plugin ---

export class TextColorPlugin implements Plugin {
	readonly id = 'textColor';
	readonly name = 'Text Color';
	readonly priority = 23;

	private readonly config: TextColorConfig;
	private readonly colors: readonly string[];
	private locale!: TextColorLocale;

	constructor(config?: Partial<TextColorConfig>) {
		this.config = { ...config };
		this.colors = resolveColors(config?.colors, COLOR_PALETTE, 'TextColorPlugin');
	}

	async init(context: PluginContext): Promise<void> {
		this.locale = await resolveLocale(
			context,
			this.config.locale,
			TEXT_COLOR_LOCALE_EN,
			loadTextColorLocale,
		);

		context.registerStyleSheet(COLOR_PICKER_CSS);
		this.registerMarkSpec(context);
		this.registerCommands(context);
		this.registerToolbarItem(context);
	}

	private registerMarkSpec(context: PluginContext): void {
		context.registerMarkSpec(
			createInlineStyleMarkSpec({
				type: 'textColor',
				rank: 5,
				valueAttr: 'color',
				domStyleProperty: 'color',
				cssProperty: 'color',
				validate: isValidCSSColor,
				validateOnParse: true,
			}),
		);
	}

	private registerCommands(context: PluginContext): void {
		context.registerCommand('removeTextColor', () => {
			return removeColorMark(context, context.getState(), 'textColor');
		});
	}

	private registerToolbarItem(context: PluginContext): void {
		const pathD =
			'M11 3L5.5 17h2.25l1.12-3h6.25l1.12 3h2.25L13 3h-2z' + 'm-1.38 9L12 5.67 14.38 12H9.62z';
		const icon: string = [
			'<svg xmlns="http://www.w3.org/2000/svg"',
			' viewBox="0 0 24 24">',
			`<path d="${pathD}"/>`,
			'<rect x="3" y="19.5" width="18" height="3"',
			' rx="0.5" fill="#e53935"/>',
			'</svg>',
		].join('');

		context.registerToolbarItem({
			id: 'textColor',
			group: 'format',
			icon,
			label: this.locale.label,
			tooltip: this.locale.tooltip,
			command: 'removeTextColor',
			popupType: 'custom',
			renderPopup: (container, ctx, onClose) => {
				renderColorPickerPopup(container, ctx, {
					markType: 'textColor',
					colors: this.colors,
					columns: 10,
					resetLabel: this.locale.resetLabel,
					resetCommand: 'removeTextColor',
					ariaLabelPrefix: this.locale.ariaLabelPrefix,
					onClose,
				});
			},
			isActive: (state: EditorState) => isColorMarkActive(state, 'textColor'),
		});
	}
}
