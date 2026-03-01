/**
 * FontPlugin: registers a font-family mark, a combobox-style toolbar selector
 * for font selection, and a developer-friendly API for registering custom fonts
 * (WOFF2, TTF, OTF).
 */

import {
	applyAttributedMark,
	getMarkAttrAtSelection,
	isAttributedMarkActive,
	removeAttributedMark,
} from '../../commands/AttributedMarkCommands.js';
import { FONT_SELECT_CSS } from '../../editor/styles/font-select.js';
import { resolvePluginLocale } from '../../i18n/resolvePluginLocale.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import { markType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import { getStyleNonceForNode, setStyleProperty } from '../../style/StyleRuntime.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { isValidCSSFontFamily } from '../shared/ColorValidation.js';
import type { PopupCloseOptions } from '../shared/PopupManager.js';
import { FONT_LOCALES, type FontLocale } from './FontLocale.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface MarkAttrRegistry {
		font: { family: string };
	}
}

// --- Public Types ---

/** Describes a single @font-face source. */
export interface FontFaceDescriptor {
	/** CSS `src` value, e.g. `"url('/fonts/My.woff2') format('woff2')"`. */
	readonly src: string;
	/** Font weight, e.g. `'400'` or `'300 700'` for variable fonts. */
	readonly weight?: string;
	/** Font style, e.g. `'normal'` or `'italic'`. */
	readonly style?: string;
	/** Font display strategy. Defaults to `'swap'`. */
	readonly display?: string;
}

/** Defines a font available in the editor. */
export interface FontDefinition {
	/** Display name shown in the toolbar dropdown. */
	readonly name: string;
	/** CSS `font-family` value, e.g. `"'Fira Code', monospace"`. */
	readonly family: string;
	/** Font category for grouping in the UI. */
	readonly category?: 'serif' | 'sans-serif' | 'monospace' | 'display' | 'handwriting';
	/**
	 * Optional `@font-face` descriptors. When provided, the plugin
	 * auto-injects the corresponding CSS rules into the document.
	 */
	readonly fontFaces?: readonly FontFaceDescriptor[];
}

// --- Configuration ---

export interface FontConfig {
	/**
	 * Fonts available in the editor. System fonts require no `fontFaces`.
	 * Custom fonts with `fontFaces` get their `@font-face` rules auto-injected.
	 *
	 * Use `STARTER_FONTS` for a pre-configured set of fonts:
	 * ```ts
	 * new FontPlugin({ fonts: [...STARTER_FONTS] })
	 * ```
	 */
	readonly fonts: readonly FontDefinition[];
	/**
	 * Name of the font that acts as the editor's default.
	 * Selecting this font removes the mark (since the editor already uses it).
	 * Defaults to the first font in the list.
	 */
	readonly defaultFont?: string;
	/** When true, a separator is rendered after the font toolbar item. */
	readonly separatorAfter?: boolean;
	readonly locale?: FontLocale;
}

// --- Plugin ---

export class FontPlugin implements Plugin {
	readonly id = 'font';
	readonly name = 'Font';
	readonly priority = 22;

	private readonly config: FontConfig;
	private locale!: FontLocale;
	private injectedStyleElement: HTMLStyleElement | null = null;
	private context: PluginContext | null = null;

	constructor(config: FontConfig) {
		this.config = config;
	}

	init(context: PluginContext): void {
		this.locale = resolvePluginLocale(FONT_LOCALES, context, this.config.locale);

		context.registerStyleSheet(FONT_SELECT_CSS);
		this.context = context;
		this.registerMarkSpec(context);
		this.registerCommands(context);
		this.registerToolbarItem(context);
		this.injectFontFaces();
	}

	destroy(): void {
		this.injectedStyleElement?.remove();
		this.injectedStyleElement = null;
		this.context = null;
	}

	// --- Schema ---

	private registerMarkSpec(context: PluginContext): void {
		context.registerMarkSpec({
			type: 'font',
			rank: 6,
			attrs: {
				family: { default: '' },
			},
			toDOM(mark) {
				const span: HTMLElement = document.createElement('span');
				const family: string = mark.attrs?.family ?? '';
				if (family) {
					setStyleProperty(span, 'fontFamily', family);
				}
				return span;
			},
			toHTMLString: (mark, content) => {
				const family: string = String(mark.attrs?.family ?? '');
				if (!family || !isValidCSSFontFamily(family)) return content;
				return `<span style="font-family: ${escapeHTML(family)}">${content}</span>`;
			},
			toHTMLStyle: (mark) => {
				const family: string = String(mark.attrs?.family ?? '');
				if (!family || !isValidCSSFontFamily(family)) return null;
				return `font-family: ${escapeHTML(family)}`;
			},
			parseHTML: [
				{
					tag: 'span',
					getAttrs: (el) => {
						const family: string = el.style.fontFamily;
						if (!family) return false;
						return { family };
					},
				},
			],
			sanitize: { tags: ['span'] },
		});
	}

	// --- Commands ---

	private registerCommands(context: PluginContext): void {
		context.registerCommand('removeFont', () => {
			const state: EditorState = context.getState();
			return this.removeFont(context, state);
		});

		context.registerCommand('setFont', () => {
			return false;
		});
	}

	// --- Toolbar ---

	private get defaultFont(): FontDefinition {
		if (this.config.defaultFont) {
			const found: FontDefinition | undefined = this.config.fonts.find(
				(f) => f.name === this.config.defaultFont,
			);
			if (found) return found;
		}
		const first: FontDefinition | undefined = this.config.fonts[0];
		if (!first) throw new Error('FontPlugin: fonts list is empty');
		return first;
	}

	private registerToolbarItem(context: PluginContext): void {
		context.registerToolbarItem({
			id: 'font',
			group: 'format',
			label: this.locale.label,
			tooltip: this.locale.tooltip,
			command: 'removeFont',
			priority: 5,
			popupType: 'combobox',
			separatorAfter: this.config.separatorAfter,
			getLabel: (state: EditorState): string => this.resolveFontName(this.getActiveFont(state)),
			renderPopup: (container, ctx, onClose) => {
				this.renderFontPopup(container, ctx, onClose);
			},
			isActive: (state) => this.isFontActive(state),
		});
	}

	private resolveFontName(family: string | null): string {
		if (!family) return this.defaultFont.name;
		const match: FontDefinition | undefined = this.config.fonts.find((f) => f.family === family);
		return match?.name ?? (family.split(',')[0] ?? '').trim().replace(/'/g, '');
	}

	// --- State Queries ---

	private isFontActive(state: EditorState): boolean {
		return isAttributedMarkActive(state, 'font');
	}

	getActiveFont(state: EditorState): string | null {
		return getMarkAttrAtSelection(state, 'font', (m) => m.attrs.family ?? null);
	}

	// --- Font Application ---

	applyFont(context: PluginContext, state: EditorState, family: string): boolean {
		const mark = { type: markType('font'), attrs: { family } };
		const tr = applyAttributedMark(state, mark);
		if (!tr) return false;

		context.dispatch(tr);
		return true;
	}

	private removeFont(context: PluginContext, state: EditorState): boolean {
		const tr = removeAttributedMark(state, markType('font'));
		if (!tr) return false;

		context.dispatch(tr);
		return true;
	}

	// --- @font-face Injection ---

	private injectFontFaces(): void {
		const rules: string[] = [];

		for (const font of this.config.fonts) {
			if (!font.fontFaces?.length) continue;

			for (const face of font.fontFaces) {
				const familyName: string = (font.family.split(',')[0] ?? '').trim().replace(/'/g, '');
				const declarations: string[] = [`font-family: '${familyName}'`, `src: ${face.src}`];
				if (face.weight) {
					declarations.push(`font-weight: ${face.weight}`);
				}
				if (face.style) {
					declarations.push(`font-style: ${face.style}`);
				}
				declarations.push(`font-display: ${face.display ?? 'swap'}`);

				rules.push(`@font-face {\n\t${declarations.join(';\n\t')};\n}`);
			}
		}

		if (rules.length === 0) return;

		const style: HTMLStyleElement = document.createElement('style');
		style.setAttribute('data-notectl-fonts', '');
		const nonce = this.context ? getStyleNonceForNode(this.context.getContainer()) : undefined;
		if (nonce) {
			style.setAttribute('nonce', nonce);
		}
		style.textContent = rules.join('\n\n');
		document.head.appendChild(style);
		this.injectedStyleElement = style;
	}

	// --- Popup Rendering ---

	private renderFontPopup(
		container: HTMLElement,
		context: PluginContext,
		onClose: (options?: PopupCloseOptions) => void,
	): void {
		container.classList.add('notectl-font-picker');

		const state: EditorState = context.getState();
		const activeFont: string | null = this.getActiveFont(state);
		const defaultFamily: string = this.defaultFont.family;
		const contentElement: HTMLElement = context.getContainer();

		const list: HTMLDivElement = document.createElement('div');
		list.className = 'notectl-font-picker__list';
		list.setAttribute('role', 'listbox');
		list.setAttribute('aria-label', this.locale.label);

		for (const font of this.config.fonts) {
			const isDefault: boolean = font.family === defaultFamily;
			const isActive: boolean = isDefault
				? !activeFont || activeFont === font.family
				: activeFont === font.family;

			const item: HTMLButtonElement = this.createFontItem(
				font.name,
				font.family,
				isActive,
				(e: MouseEvent) => {
					e.preventDefault();
					e.stopPropagation();
					if (isDefault) {
						context.executeCommand('removeFont');
					} else {
						this.applyFont(context, context.getState(), font.family);
					}
					onClose({ restoreFocusTo: contentElement });
				},
			);

			if (font.category) {
				item.setAttribute('data-category', font.category);
			}

			list.appendChild(item);
		}

		container.appendChild(list);
	}

	private createFontItem(
		name: string,
		family: string,
		isActive: boolean,
		handler: (e: MouseEvent) => void,
	): HTMLButtonElement {
		const item: HTMLButtonElement = document.createElement('button');
		item.type = 'button';
		item.className = 'notectl-font-picker__item';
		item.setAttribute('role', 'option');
		item.setAttribute('aria-selected', String(isActive));

		if (isActive) {
			item.classList.add('notectl-font-picker__item--active');
		}

		// Checkmark indicator
		const check: HTMLSpanElement = document.createElement('span');
		check.className = 'notectl-font-picker__check';
		check.textContent = isActive ? '\u2713' : '';
		item.appendChild(check);

		// Font name label (rendered in the font itself for preview)
		const label: HTMLSpanElement = document.createElement('span');
		label.className = 'notectl-font-picker__label';
		label.textContent = name;
		if (family) {
			setStyleProperty(label, 'fontFamily', family);
		}
		item.appendChild(label);

		item.addEventListener('mousedown', handler);
		return item;
	}
}
