/**
 * HighlightPlugin: registers a highlight (background-color) mark with attrs,
 * toolbar button with a color picker popup, and removeHighlight command.
 */

import { COLOR_PICKER_CSS } from '../../editor/styles/color-picker.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { isColorMarkActive, removeColorMark } from '../shared/ColorMarkOperations.js';
import { renderColorPickerPopup } from '../shared/ColorPickerPopup.js';
import { resolveColors } from '../shared/ColorValidation.js';

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
	/** When true, a separator is rendered after the highlight toolbar item. */
	readonly separatorAfter?: boolean;
}

// --- Color Palette (Highlight-optimized: 10 columns x 5 rows) ---

const HIGHLIGHT_PALETTE: readonly string[] = [
	// Row 1 — Classic highlighter colors (bright, vivid)
	'#fff176',
	'#aed581',
	'#4dd0e1',
	'#64b5f6',
	'#ce93d8',
	'#f48fb1',
	'#ffab91',
	'#ff8a65',
	'#e6ee9c',
	'#80cbc4',
	// Row 2 — Light pastels
	'#fff9c4',
	'#dcedc8',
	'#e0f7fa',
	'#e3f2fd',
	'#f3e5f5',
	'#fce4ec',
	'#fff3e0',
	'#fbe9e7',
	'#f9fbe7',
	'#e0f2f1',
	// Row 3 — Medium pastels
	'#fff59d',
	'#c5e1a5',
	'#80deea',
	'#90caf9',
	'#e1bee7',
	'#f8bbd0',
	'#ffcc80',
	'#ffab91',
	'#e6ee9c',
	'#a5d6a7',
	// Row 4 — Bold pastels
	'#ffee58',
	'#9ccc65',
	'#26c6da',
	'#42a5f5',
	'#ab47bc',
	'#ec407a',
	'#ffa726',
	'#ff7043',
	'#d4e157',
	'#66bb6a',
	// Row 5 — Grays and neutral highlights
	'#ffffff',
	'#fafafa',
	'#f5f5f5',
	'#eeeeee',
	'#e0e0e0',
	'#bdbdbd',
	'#e8eaf6',
	'#efebe9',
	'#eceff1',
	'#fafafa',
];

// --- Plugin ---

export class HighlightPlugin implements Plugin {
	readonly id = 'highlight';
	readonly name = 'Highlight';
	readonly priority = 24;

	private readonly config: HighlightConfig;
	private readonly colors: readonly string[];

	constructor(config?: Partial<HighlightConfig>) {
		this.config = { ...config };
		this.colors = resolveColors(config?.colors, HIGHLIGHT_PALETTE, 'HighlightPlugin');
	}

	init(context: PluginContext): void {
		context.registerStyleSheet(COLOR_PICKER_CSS);
		this.registerMarkSpec(context);
		this.registerCommands(context);
		this.registerToolbarItem(context);
	}

	private registerMarkSpec(context: PluginContext): void {
		context.registerMarkSpec({
			type: 'highlight',
			rank: 4,
			attrs: {
				color: { default: '' },
			},
			toDOM(mark) {
				const span = document.createElement('span');
				const color = mark.attrs?.color ?? '';
				span.style.backgroundColor = color;
				return span;
			},
			toHTMLString: (mark, content) => {
				const color: string = String(mark.attrs?.color ?? '');
				return `<span style="background-color: ${color}">${content}</span>`;
			},
			parseHTML: [
				{
					tag: 'span',
					getAttrs: (el) => {
						const color: string = el.style.backgroundColor;
						if (!color) return false;
						return { color };
					},
				},
			],
			sanitize: { tags: ['span'] },
		});
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
			label: 'Highlight',
			tooltip: 'Highlight Color',
			command: 'removeHighlight',
			priority: 46,
			popupType: 'custom',
			separatorAfter: this.config.separatorAfter,
			renderPopup: (container, ctx, onClose) => {
				renderColorPickerPopup(container, ctx, {
					markType: 'highlight',
					colors: this.colors,
					columns: 10,
					resetLabel: 'None',
					resetCommand: 'removeHighlight',
					ariaLabelPrefix: 'Highlight color',
					onClose,
				});
			},
			isActive: (state: EditorState) => isColorMarkActive(state, 'highlight'),
		});
	}
}
