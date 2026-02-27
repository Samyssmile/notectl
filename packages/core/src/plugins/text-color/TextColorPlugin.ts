/**
 * TextColorPlugin: registers a text color mark with attrs,
 * toolbar button with a color picker popup, and removeTextColor command.
 */

import { COLOR_PICKER_CSS } from '../../editor/styles/color-picker.js';
import { resolvePluginLocale } from '../../i18n/resolvePluginLocale.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import type { EditorState } from '../../state/EditorState.js';
import { setStyleProperty } from '../../style/StyleRuntime.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { isColorMarkActive, removeColorMark } from '../shared/ColorMarkOperations.js';
import { renderColorPickerPopup } from '../shared/ColorPickerPopup.js';
import { isValidCSSColor, resolveColors } from '../shared/ColorValidation.js';
import { TEXT_COLOR_LOCALES, type TextColorLocale } from './TextColorLocale.js';

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
	/** When true, a separator is rendered after the textColor toolbar item. */
	readonly separatorAfter?: boolean;
	readonly locale?: TextColorLocale;
}

// --- Color Palette (Google Docs style: 10 columns x 7 rows) ---

const COLOR_PALETTE: readonly string[] = [
	// Row 1 — dark
	'#000000',
	'#434343',
	'#666666',
	'#999999',
	'#b7b7b7',
	'#cccccc',
	'#d9d9d9',
	'#efefef',
	'#f3f3f3',
	'#ffffff',
	// Row 2 — vivid
	'#980000',
	'#ff0000',
	'#ff9900',
	'#ffff00',
	'#00ff00',
	'#00ffff',
	'#4a86e8',
	'#0000ff',
	'#9900ff',
	'#ff00ff',
	// Row 3 — light 3
	'#e6b8af',
	'#f4cccc',
	'#fce5cd',
	'#fff2cc',
	'#d9ead3',
	'#d0e0e3',
	'#c9daf8',
	'#cfe2f3',
	'#d9d2e9',
	'#ead1dc',
	// Row 4 — light 2
	'#dd7e6b',
	'#ea9999',
	'#f9cb9c',
	'#ffe599',
	'#b6d7a8',
	'#a2c4c9',
	'#a4c2f4',
	'#9fc5e8',
	'#b4a7d6',
	'#d5a6bd',
	// Row 5 — light 1
	'#cc4125',
	'#e06666',
	'#f6b26b',
	'#ffd966',
	'#93c47d',
	'#76a5af',
	'#6d9eeb',
	'#6fa8dc',
	'#8e7cc3',
	'#c27ba0',
	// Row 6 — dark 1
	'#a61c00',
	'#cc0000',
	'#e69138',
	'#f1c232',
	'#6aa84f',
	'#45818e',
	'#3c78d8',
	'#3d85c6',
	'#674ea7',
	'#a64d79',
	// Row 7 — dark 2
	'#85200c',
	'#990000',
	'#b45f06',
	'#bf9000',
	'#38761d',
	'#134f5c',
	'#1155cc',
	'#0b5394',
	'#351c75',
	'#741b47',
];

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

	init(context: PluginContext): void {
		this.locale = resolvePluginLocale(TEXT_COLOR_LOCALES, context, this.config.locale);

		context.registerStyleSheet(COLOR_PICKER_CSS);
		this.registerMarkSpec(context);
		this.registerCommands(context);
		this.registerToolbarItem(context);
	}

	private registerMarkSpec(context: PluginContext): void {
		context.registerMarkSpec({
			type: 'textColor',
			rank: 5,
			attrs: {
				color: { default: '' },
			},
			toDOM(mark) {
				const span = document.createElement('span');
				const color = mark.attrs?.color ?? '';
				setStyleProperty(span, 'color', color);
				return span;
			},
			toHTMLString: (mark, content) => {
				const color: string = String(mark.attrs?.color ?? '');
				if (!color || !isValidCSSColor(color)) return content;
				return `<span style="color: ${escapeHTML(color)}">${content}</span>`;
			},
			toHTMLStyle: (mark) => {
				const color: string = String(mark.attrs?.color ?? '');
				if (!color || !isValidCSSColor(color)) return null;
				return `color: ${escapeHTML(color)}`;
			},
			parseHTML: [
				{
					tag: 'span',
					getAttrs: (el) => {
						const color: string = el.style.color;
						if (!color || !isValidCSSColor(color)) return false;
						return { color };
					},
				},
			],
			sanitize: { tags: ['span'] },
		});
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
			priority: 45,
			popupType: 'custom',
			separatorAfter: this.config.separatorAfter,
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
