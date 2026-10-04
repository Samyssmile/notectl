/**
 * TextColorPlugin: registers a text color mark with attrs,
 * toolbar button with a color picker popup, and removeTextColor command.
 */

import COLOR_PICKER_CSS from '../../editor/styles/color-picker.css?inline';
import type { StyleClassNames } from '../../model/StyleClass.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { isColorMarkActive, removeColorMark } from '../shared/ColorMarkOperations.js';
import { renderColorPickerPopup } from '../shared/ColorPickerPopup.js';
import {
	hexColorKey,
	isValidCSSColor,
	knownColors,
	resolveColors,
} from '../shared/ColorValidation.js';
import {
	type InlineStyleMarkConfig,
	createInlineStyleMarkSpec,
	styleDeclaration,
} from '../shared/InlineStyleMarkSpec.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import { registerStyleClassNames } from '../shared/StyleClassNames.js';
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
	/**
	 * Your own CSS class per text color in HTML content, keyed by hex color, e.g.
	 * `{ '#e03131': 'text-red' }`. Class-based export (`getContentHTML({ cssMode: 'classes' })`)
	 * writes these classes instead of generated `notectl-s-*` names, and HTML import
	 * and paste recognize them, so content round-trips with your stylesheet. Colors
	 * outside `colors` may have a class too. Invalid keys or class names make editor
	 * initialization fail with a `TypeError` that explains the fix.
	 */
	readonly styleClasses?: StyleClassNames<string>;
	readonly locale?: TextColorLocale;
}

/** The text color mark: one `color` declaration per text run. */
const TEXT_COLOR_MARK: InlineStyleMarkConfig = {
	type: 'textColor',
	rank: 5,
	valueAttr: 'color',
	domStyleProperty: 'color',
	cssProperty: 'color',
	validate: isValidCSSColor,
	validateOnParse: true,
};

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
		this.registerStyleClasses(context);
		this.registerCommands(context);
		this.registerToolbarItem(context);
	}

	private registerMarkSpec(context: PluginContext): void {
		const knownValues: readonly string[] = knownColors(this.colors, this.config.styleClasses);
		context.registerMarkSpec(createInlineStyleMarkSpec({ ...TEXT_COLOR_MARK, knownValues }));
	}

	private registerStyleClasses(context: PluginContext): void {
		registerStyleClassNames(context, 'TextColorPlugin', this.config.styleClasses, (key: string) =>
			styleDeclaration(TEXT_COLOR_MARK.cssProperty, hexColorKey(key)),
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
