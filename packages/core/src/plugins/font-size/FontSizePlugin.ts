/**
 * FontSizePlugin: registers a fontSize mark with attrs, a combobox-style
 * toolbar selector with WCAG-accessible popup, and commands for
 * increasing / decreasing font size.
 */

import { FONT_SIZE_SELECT_CSS } from '../../editor/styles/font-size-select.js';
import { resolvePluginLocale } from '../../i18n/resolvePluginLocale.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import type { EditorState } from '../../state/EditorState.js';
import { setStyleProperty } from '../../style/StyleRuntime.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { isValidCSSFontSize } from '../shared/ColorValidation.js';
import { ToolbarServiceKey } from '../toolbar/ToolbarPlugin.js';
import { FONT_SIZE_LOCALES, type FontSizeLocale } from './FontSizeLocale.js';
import {
	getActiveSizeNumeric,
	isFontSizeActive,
	removeFontSize,
	stepFontSize,
} from './FontSizeOperations.js';
import { renderFontSizePopup } from './FontSizePopup.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface MarkAttrRegistry {
		fontSize: { size: string };
	}
}

// --- Constants ---

/** Default preset sizes shown in the font size dropdown. */
export const DEFAULT_FONT_SIZES: readonly number[] = [
	8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72, 96,
];

const DEFAULT_FONT_SIZE = 16;

// --- Configuration ---

export interface FontSizeConfig {
	/**
	 * Preset sizes shown in the font size dropdown.
	 * Must contain positive integers. Values are sorted and deduplicated automatically.
	 * Defaults to {@link DEFAULT_FONT_SIZES} when omitted or empty.
	 */
	readonly sizes?: readonly number[];
	/**
	 * The base font size that text has when no fontSize mark is applied.
	 * Shown as the initial value in the toolbar combo and used as the
	 * "neutral" size — selecting it removes the mark instead of applying one.
	 * Defaults to 16.
	 */
	readonly defaultSize?: number;
	/** When true, a separator is rendered after the fontSize toolbar item. */
	readonly separatorAfter?: boolean;
	readonly locale?: FontSizeLocale;
}

// --- Plugin ---

export class FontSizePlugin implements Plugin {
	readonly id = 'fontSize';
	readonly name = 'Font Size';
	readonly priority = 21;

	private readonly config: FontSizeConfig;
	private readonly sizes: readonly number[];
	private readonly defaultSize: number;
	private locale!: FontSizeLocale;
	private context: PluginContext | null = null;

	constructor(config?: Partial<FontSizeConfig>) {
		this.config = { ...config };
		this.sizes = resolveSizes(config?.sizes);
		this.defaultSize = resolveDefaultSize(config?.defaultSize);
	}

	init(context: PluginContext): void {
		this.locale = resolvePluginLocale(FONT_SIZE_LOCALES, context, this.config.locale);

		context.registerStyleSheet(FONT_SIZE_SELECT_CSS);
		this.context = context;
		this.registerMarkSpec(context);
		this.registerCommands(context);
		this.registerKeymaps(context);
		this.registerToolbarItem(context);
		this.applyDefaultSizeToContainer(context);
	}

	destroy(): void {
		this.context = null;
	}

	// --- Schema ---

	private registerMarkSpec(context: PluginContext): void {
		context.registerMarkSpec({
			type: 'fontSize',
			rank: 4,
			attrs: {
				size: { default: '' },
			},
			toDOM(mark) {
				const span: HTMLElement = document.createElement('span');
				const size: string = mark.attrs?.size ?? '';
				if (size) {
					setStyleProperty(span, 'fontSize', size);
				}
				return span;
			},
			toHTMLString: (mark, content) => {
				const size: string = String(mark.attrs?.size ?? '');
				if (!size || !isValidCSSFontSize(size)) return content;
				return `<span style="font-size: ${escapeHTML(size)}">${content}</span>`;
			},
			toHTMLStyle: (mark) => {
				const size: string = String(mark.attrs?.size ?? '');
				if (!size || !isValidCSSFontSize(size)) return null;
				return `font-size: ${escapeHTML(size)}`;
			},
			parseHTML: [
				{
					tag: 'span',
					getAttrs: (el) => {
						const size: string = el.style.fontSize;
						if (!size) return false;
						return { size };
					},
				},
			],
			sanitize: { tags: ['span'] },
		});
	}

	// --- Commands ---

	private registerCommands(context: PluginContext): void {
		context.registerCommand('removeFontSize', () => {
			return removeFontSize(context, context.getState());
		});

		context.registerCommand('setFontSize', () => {
			return false;
		});

		context.registerCommand('increaseFontSize', () => {
			return stepFontSize(context, context.getState(), 'up', this.sizes, this.defaultSize);
		});

		context.registerCommand('decreaseFontSize', () => {
			return stepFontSize(context, context.getState(), 'down', this.sizes, this.defaultSize);
		});
	}

	// --- Keymaps ---

	private registerKeymaps(context: PluginContext): void {
		context.registerKeymap({
			'Mod-Shift-+': () => {
				return stepFontSize(context, context.getState(), 'up', this.sizes, this.defaultSize);
			},
			'Mod-Shift-_': () => {
				return stepFontSize(context, context.getState(), 'down', this.sizes, this.defaultSize);
			},
		});
	}

	// --- Toolbar ---

	private registerToolbarItem(context: PluginContext): void {
		context.registerToolbarItem({
			id: 'fontSize',
			group: 'format',
			label: this.locale.label,
			tooltip: this.locale.tooltip,
			command: 'removeFontSize',
			priority: 6,
			popupType: 'combobox',
			separatorAfter: this.config.separatorAfter,
			getLabel: (state: EditorState): string =>
				String(getActiveSizeNumeric(state, this.defaultSize)),
			renderPopup: (container, ctx) => {
				renderFontSizePopup(container, ctx, {
					sizes: this.sizes,
					defaultSize: this.defaultSize,
					dismissPopup: () => this.dismissPopup(),
					locale: this.locale,
				});
			},
			isActive: (state) => isFontSizeActive(state),
		});
	}

	/**
	 * Sets the configured default font size on the editor content container
	 * so that unformatted text renders at the correct size instead of the
	 * browser default (16px).
	 */
	private applyDefaultSizeToContainer(context: PluginContext): void {
		const container: HTMLElement = context.getContainer();
		setStyleProperty(container, 'fontSize', `${this.defaultSize}px`);
	}

	private dismissPopup(): void {
		const toolbar = this.context?.getService(ToolbarServiceKey);
		toolbar?.closePopup();
	}
}

// --- Helpers ---

function resolveSizes(sizes: readonly number[] | undefined): readonly number[] {
	if (!sizes || sizes.length === 0) return DEFAULT_FONT_SIZES;
	const unique: number[] = [...new Set(sizes)].filter((n) => Number.isInteger(n) && n > 0);
	unique.sort((a, b) => a - b);
	return unique.length > 0 ? unique : DEFAULT_FONT_SIZES;
}

function resolveDefaultSize(size: number | undefined): number {
	if (size === undefined) return DEFAULT_FONT_SIZE;
	return Number.isInteger(size) && size > 0 ? size : DEFAULT_FONT_SIZE;
}
