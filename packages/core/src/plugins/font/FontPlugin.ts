/**
 * FontPlugin: registers a font-family mark, a combobox-style toolbar selector
 * for font selection, and a developer-friendly API for registering custom fonts
 * (WOFF2, TTF, OTF).
 */

import { isMarkOfType } from '../../model/AttrRegistry.js';
import { getBlockMarksAtOffset, getTextChildren, hasMark } from '../../model/Document.js';
import type { BlockNode, Mark } from '../../model/Document.js';
import { isCollapsed, isNodeSelection, selectionRange } from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { ToolbarServiceKey } from '../toolbar/ToolbarPlugin.js';

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
}

// --- Plugin ---

export class FontPlugin implements Plugin {
	readonly id = 'font';
	readonly name = 'Font';
	readonly priority = 22;

	private readonly config: FontConfig;
	private injectedStyleElement: HTMLStyleElement | null = null;
	private context: PluginContext | null = null;
	private comboLabel: HTMLSpanElement | null = null;

	constructor(config: FontConfig) {
		this.config = config;
	}

	init(context: PluginContext): void {
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
		this.comboLabel = null;
	}

	onStateChange(_oldState: EditorState, newState: EditorState, _tr: Transaction): void {
		this.updateComboLabel(newState);
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
					span.style.fontFamily = family;
				}
				return span;
			},
			toHTMLString: (mark, content) => {
				const family: string = String(mark.attrs?.family ?? '');
				if (!family) return content;
				return `<span style="font-family: ${family}">${content}</span>`;
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
		// The icon content renders as a combobox label + dropdown arrow.
		// The actual label text is updated via onStateChange → updateComboLabel.
		const defaultName: string = this.defaultFont.name;
		const label: string = `<span class="notectl-font-select__label" data-font-label>${defaultName}</span>`;
		const arrow = '<span class="notectl-font-select__arrow">\u25BE</span>';
		const icon = `${label}${arrow}`;

		context.registerToolbarItem({
			id: 'font',
			group: 'format',
			icon,
			label: 'Font',
			tooltip: 'Font Family',
			command: 'removeFont',
			priority: 5,
			popupType: 'custom',
			separatorAfter: this.config.separatorAfter,
			renderPopup: (container, ctx) => {
				this.renderFontPopup(container, ctx);
			},
			isActive: (state) => this.isFontActive(state),
		});
	}

	private updateComboLabel(state: EditorState): void {
		// Lazily find the label element in the DOM
		if (!this.comboLabel) {
			const container: HTMLElement | undefined = this.context?.getPluginContainer('top');
			if (!container) return;
			this.comboLabel = container.querySelector<HTMLSpanElement>('[data-font-label]') ?? null;
			if (!this.comboLabel) return;
		}

		const activeFamily: string | null = this.getActiveFont(state);
		const displayName: string = this.resolveFontName(activeFamily);
		this.comboLabel.textContent = displayName;
	}

	private resolveFontName(family: string | null): string {
		if (!family) return this.defaultFont.name;
		const match: FontDefinition | undefined = this.config.fonts.find((f) => f.family === family);
		return match?.name ?? (family.split(',')[0] ?? '').trim().replace(/'/g, '');
	}

	// --- State Queries ---

	private isFontActive(state: EditorState): boolean {
		return this.getActiveFont(state) !== null;
	}

	getActiveFont(state: EditorState): string | null {
		const sel = state.selection;
		if (isNodeSelection(sel)) return null;

		if (isCollapsed(sel)) {
			if (state.storedMarks) {
				const mark = state.storedMarks.find((m) => m.type === 'font');
				return mark && isMarkOfType(mark, 'font') ? (mark.attrs.family ?? null) : null;
			}
			const block = state.getBlock(sel.anchor.blockId);
			if (!block) return null;
			const marks = getBlockMarksAtOffset(block, sel.anchor.offset);
			const mark = marks.find((m) => m.type === 'font');
			return mark && isMarkOfType(mark, 'font') ? (mark.attrs.family ?? null) : null;
		}

		const block = state.getBlock(sel.anchor.blockId);
		if (!block) return null;
		const marks = getBlockMarksAtOffset(block, sel.anchor.offset);
		const mark = marks.find((m) => m.type === 'font');
		return mark && isMarkOfType(mark, 'font') ? (mark.attrs.family ?? null) : null;
	}

	// --- Font Application ---

	applyFont(context: PluginContext, state: EditorState, family: string): boolean {
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		if (isCollapsed(sel)) {
			const anchorBlock = state.getBlock(sel.anchor.blockId);
			if (!anchorBlock) return false;
			const currentMarks =
				state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
			const withoutFont = currentMarks.filter((m) => m.type !== 'font');
			const newMarks = [...withoutFont, { type: markType('font'), attrs: { family } }];

			const tr = state
				.transaction('command')
				.setStoredMarks(newMarks, state.storedMarks)
				.setSelection(sel)
				.build();
			context.dispatch(tr);
			return true;
		}

		const blockOrder = state.getBlockOrder();
		const range = selectionRange(sel, blockOrder);
		const builder = state.transaction('command');

		const fromIdx: number = blockOrder.indexOf(range.from.blockId);
		const toIdx: number = blockOrder.indexOf(range.to.blockId);

		const mark = { type: markType('font'), attrs: { family } };

		for (let i: number = fromIdx; i <= toIdx; i++) {
			const blockId = blockOrder[i];
			if (!blockId) continue;
			const block = state.getBlock(blockId);
			if (!block) continue;
			const blockLen: number = block.children.reduce(
				(sum, c) => sum + ('text' in c ? c.text.length : 0),
				0,
			);

			const from: number = i === fromIdx ? range.from.offset : 0;
			const to: number = i === toIdx ? range.to.offset : blockLen;

			if (from !== to) {
				const existing: Mark | undefined = this.findFontMarkInRange(block, from, to);
				if (existing) {
					builder.removeMark(blockId, from, to, existing);
				}
				builder.addMark(blockId, from, to, mark);
			}
		}

		builder.setSelection(sel);
		context.dispatch(builder.build());
		return true;
	}

	private removeFont(context: PluginContext, state: EditorState): boolean {
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		if (isCollapsed(sel)) {
			const anchorBlock = state.getBlock(sel.anchor.blockId);
			if (!anchorBlock) return false;
			const currentMarks =
				state.storedMarks ?? getBlockMarksAtOffset(anchorBlock, sel.anchor.offset);
			if (!hasMark(currentMarks, markType('font'))) return false;

			const newMarks = currentMarks.filter((m) => m.type !== 'font');
			const tr = state
				.transaction('command')
				.setStoredMarks(newMarks, state.storedMarks)
				.setSelection(sel)
				.build();
			context.dispatch(tr);
			return true;
		}

		const blockOrder = state.getBlockOrder();
		const range = selectionRange(sel, blockOrder);
		const builder = state.transaction('command');

		const fromIdx: number = blockOrder.indexOf(range.from.blockId);
		const toIdx: number = blockOrder.indexOf(range.to.blockId);

		for (let i: number = fromIdx; i <= toIdx; i++) {
			const blockId = blockOrder[i];
			if (!blockId) continue;
			const block = state.getBlock(blockId);
			if (!block) continue;
			const blockLen: number = block.children.reduce(
				(sum, c) => sum + ('text' in c ? c.text.length : 0),
				0,
			);

			const from: number = i === fromIdx ? range.from.offset : 0;
			const to: number = i === toIdx ? range.to.offset : blockLen;

			if (from !== to) {
				const existing: Mark | undefined = this.findFontMarkInRange(block, from, to);
				if (existing) {
					builder.removeMark(blockId, from, to, existing);
				}
			}
		}

		builder.setSelection(sel);
		context.dispatch(builder.build());
		return true;
	}

	/** Finds the first font mark in a block's text range (for proper step inversion). */
	private findFontMarkInRange(block: BlockNode, from: number, to: number): Mark | undefined {
		const textChildren = getTextChildren(block);
		let pos = 0;
		for (const node of textChildren) {
			const nodeEnd: number = pos + node.text.length;
			if (nodeEnd > from && pos < to) {
				const fontMark: Mark | undefined = node.marks.find((m) => m.type === 'font');
				if (fontMark) return fontMark;
			}
			pos = nodeEnd;
		}
		return undefined;
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
		style.textContent = rules.join('\n\n');
		document.head.appendChild(style);
		this.injectedStyleElement = style;
	}

	// --- Popup Rendering ---

	private dismissPopup(): void {
		const toolbar = this.context?.getService(ToolbarServiceKey);
		toolbar?.closePopup();
	}

	private renderFontPopup(container: HTMLElement, context: PluginContext): void {
		container.classList.add('notectl-font-picker');

		const state: EditorState = context.getState();
		const activeFont: string | null = this.getActiveFont(state);
		const defaultFamily: string = this.defaultFont.family;

		const list: HTMLDivElement = document.createElement('div');
		list.className = 'notectl-font-picker__list';

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
					this.dismissPopup();
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
			label.style.fontFamily = family;
		}
		item.appendChild(label);

		item.addEventListener('mousedown', handler);
		return item;
	}
}
