/**
 * FontSizePlugin: registers a fontSize mark with attrs, a combobox-style
 * toolbar selector with WCAG-accessible popup, and commands for
 * increasing / decreasing font size.
 */

import FONT_SIZE_SELECT_CSS from '../../editor/styles/font-size-select.css?inline';
import type { StyleClassNames } from '../../model/StyleClass.js';
import type { EditorState } from '../../state/EditorState.js';
import { setStyleProperty } from '../../style/StyleRuntime.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { isValidCSSFontSize } from '../shared/ColorValidation.js';
import {
	type InlineStyleMarkConfig,
	createInlineStyleMarkSpec,
	styleDeclaration,
} from '../shared/InlineStyleMarkSpec.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import { registerStyleClassNames } from '../shared/StyleClassNames.js';
import { FONT_SIZE_LOCALE_EN, type FontSizeLocale, loadFontSizeLocale } from './FontSizeLocale.js';
import {
	getActiveSizeNumeric,
	isFontSizeActive,
	pixelFontSize,
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
	/**
	 * Your own CSS class per font size in HTML content, keyed by pixel size, e.g.
	 * `{ 14: 'text-sm', 18: 'text-lg' }`. Class-based export (`getContentHTML({ cssMode: 'classes' })`)
	 * writes these classes instead of generated `notectl-s-*` names, and HTML import
	 * and paste recognize them, so content round-trips with your stylesheet. Sizes
	 * outside `sizes` may have a class too. Invalid keys or class names make editor
	 * initialization fail with a `TypeError` that explains the fix.
	 */
	readonly styleClasses?: StyleClassNames<number>;
	readonly locale?: FontSizeLocale;
}

/** The font size mark: one `font-size` declaration per text run. */
const FONT_SIZE_MARK: InlineStyleMarkConfig = {
	type: 'fontSize',
	rank: 4,
	valueAttr: 'size',
	domStyleProperty: 'fontSize',
	cssProperty: 'font-size',
	validate: isValidCSSFontSize,
};

/** A whole number of pixels without unit, as `styleClasses` keys are written. */
const PIXEL_SIZE_KEY: RegExp = /^[1-9]\d*$/;

// --- Plugin ---

export class FontSizePlugin implements Plugin {
	readonly id = 'fontSize';
	readonly name = 'Font Size';
	readonly priority = 21;

	private readonly config: FontSizeConfig;
	private readonly sizes: readonly number[];
	private readonly defaultSize: number;
	private locale!: FontSizeLocale;

	constructor(config?: Partial<FontSizeConfig>) {
		this.config = { ...config };
		this.sizes = resolveSizes(config?.sizes);
		this.defaultSize = resolveDefaultSize(config?.defaultSize);
	}

	async init(context: PluginContext): Promise<void> {
		this.locale = await resolveLocale(
			context,
			this.config.locale,
			FONT_SIZE_LOCALE_EN,
			loadFontSizeLocale,
		);

		context.registerStyleSheet(FONT_SIZE_SELECT_CSS);
		this.registerMarkSpec(context);
		this.registerStyleClasses(context);
		this.registerCommands(context);
		this.registerKeymaps(context);
		this.registerToolbarItem(context);
		this.applyDefaultSizeToContainer(context);
	}

	destroy(): void {
		// no-op: nothing to clean up
	}

	// --- Schema ---

	private registerMarkSpec(context: PluginContext): void {
		context.registerMarkSpec(createInlineStyleMarkSpec(FONT_SIZE_MARK));
	}

	private registerStyleClasses(context: PluginContext): void {
		registerStyleClassNames(context, 'FontSizePlugin', this.config.styleClasses, (key: string) =>
			styleDeclaration(FONT_SIZE_MARK.cssProperty, pixelFontSize(pixelSizeKey(key))),
		);
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
			popupType: 'combobox',
			getLabel: (state: EditorState): string =>
				String(getActiveSizeNumeric(state, this.defaultSize)),
			renderPopup: (container, ctx, onClose) => {
				renderFontSizePopup(container, ctx, {
					sizes: this.sizes,
					defaultSize: this.defaultSize,
					onClose,
					contentElement: ctx.getContainer(),
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

/** Reads a `styleClasses` key as a pixel size. Throws a `TypeError` for anything else. */
function pixelSizeKey(key: string): number {
	if (!PIXEL_SIZE_KEY.test(key)) {
		throw new TypeError(`"${key}" is not a font size; use whole pixel numbers such as 18.`);
	}
	return Number(key);
}
