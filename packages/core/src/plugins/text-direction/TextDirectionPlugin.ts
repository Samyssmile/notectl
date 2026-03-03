/**
 * TextDirectionPlugin: adds block-level text direction (`dir` attribute)
 * and inline bidi isolation (`<bdi>` mark) for RTL language support.
 *
 * Block-level: patches NodeSpecs for directable types to render the HTML
 * `dir` attribute. Provides `setDirectionLTR`, `setDirectionRTL`, and
 * `setDirectionAuto` commands with a toolbar dropdown.
 *
 * Inline: registers a `bdi` mark for bidi isolation of inline spans,
 * with `toggleBidiLTR`, `toggleBidiRTL`, `toggleBidiAuto`, and
 * `removeBidi` commands.
 */

import {
	applyAttributedMark,
	isAttributedMarkActive,
	removeAttributedMark,
} from '../../commands/AttributedMarkCommands.js';
import { LocaleServiceKey } from '../../i18n/LocaleService.js';
import type { BlockNode } from '../../model/Document.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import { isCollapsed, isNodeSelection, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { markType } from '../../model/TypeBrands.js';
import { isMac } from '../../platform/Platform.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { getSelectedBlock } from '../shared/PluginHelpers.js';
import { formatShortcut } from '../shared/ShortcutFormatting.js';
import { getBlockDir } from './DirectionDetection.js';
import { ShiftDirectionHandler } from './ShiftDirectionHandler.js';
import {
	TEXT_DIRECTION_LOCALE_EN,
	type TextDirectionLocale,
	loadTextDirectionLocale,
} from './TextDirectionLocale.js';
import {
	registerAutoDetectMiddleware,
	registerInheritDirMiddleware,
	registerPreserveDirMiddleware,
} from './TextDirectionMiddleware.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface MarkAttrRegistry {
		bdi: { dir: 'ltr' | 'rtl' | 'auto' };
	}
}

// --- Public Types ---

export type TextDirection = 'ltr' | 'rtl' | 'auto';

export interface TextDirectionConfig {
	/** Block types that support direction. */
	readonly directableTypes: readonly string[];
	/** When true, a separator is rendered after the toolbar item. */
	readonly separatorAfter?: boolean;
	readonly locale?: TextDirectionLocale;
}

// --- Constants ---

const DEFAULT_CONFIG: TextDirectionConfig = {
	directableTypes: [
		'paragraph',
		'heading',
		'title',
		'subtitle',
		'table_cell',
		'blockquote',
		'list_item',
	],
};

export const DIRECTION_ICONS: Readonly<Record<TextDirection, string>> = {
	ltr: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9 10v5h2V4h2v11h2V4h2V2H9C6.79 2 5 3.79 5 6s1.79 4 4 4zm12 8l-4-4v3H5v2h12v3l4-4z"/></svg>',
	rtl: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 10v5h2V4h2v11h2V4h2V2h-8C7.79 2 6 3.79 6 6s1.79 4 4 4zM8 14l-4 4 4 4v-3h12v-2H8v-3z"/></svg>',
	auto: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9 10v5h2V4h2v11h2V4h2V2H9C6.79 2 5 3.79 5 6s1.79 4 4 4zm3 8l-4-4v3H3v2h5v3l4-4zm7 0v-3l4 4-4 4v-3h-5v-2h5z"/></svg>',
};

const ALL_DIRECTIONS: readonly TextDirection[] = ['ltr', 'rtl', 'auto'];

const INLINE_BDI_ICON: string =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 4v7h2V4h2v7h2V4h1V2H10a3 3 0 1 0 0 6zm-3.5 9.5L3 17l3.5 3.5V18h3v-2h-3v-2.5zm14 0L17 17l3.5 3.5V18h-3v-2h3v-2.5zM11 16h2v6h-2z"/></svg>';

// --- Plugin ---

export class TextDirectionPlugin implements Plugin {
	readonly id = 'text-direction';
	readonly name = 'Text Direction';
	readonly priority = 91;

	private readonly config: TextDirectionConfig;
	private locale!: TextDirectionLocale;
	private directableTypes!: ReadonlySet<string>;
	private shiftDirHandler: ShiftDirectionHandler | null = null;

	constructor(config?: Partial<TextDirectionConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	async init(context: PluginContext): Promise<void> {
		if (this.config.locale) {
			this.locale = this.config.locale;
		} else {
			const service = context.getService(LocaleServiceKey);
			const lang: string = service?.getLocale() ?? 'en';
			this.locale = lang === 'en' ? TEXT_DIRECTION_LOCALE_EN : await loadTextDirectionLocale(lang);
		}

		this.directableTypes = new Set(this.config.directableTypes);
		this.patchNodeSpecs(context);
		this.registerBdiMark(context);
		this.registerCommands(context);
		this.registerKeymaps(context);
		this.registerToolbarItem(context);
		this.registerInlineToolbarItem(context);
		registerPreserveDirMiddleware(context, this.directableTypes);
		registerAutoDetectMiddleware(context, this.directableTypes);
		registerInheritDirMiddleware(context, this.directableTypes);

		// Ctrl+Shift direction shortcuts (Windows/Linux convention)
		if (!isMac()) {
			this.shiftDirHandler = new ShiftDirectionHandler(context);
			this.shiftDirHandler.attach(context.getContainer());
		}
	}

	destroy(): void {
		this.shiftDirHandler?.detach();
		this.shiftDirHandler = null;
	}

	// --- NodeSpec Patching ---

	/**
	 * Patches existing NodeSpecs for directable block types to support the
	 * `dir` attribute and render it as an HTML attribute. Skips types
	 * that already define a `dir` attribute in their spec.
	 */
	private patchNodeSpecs(context: PluginContext): void {
		const registry = context.getSchemaRegistry();

		for (const type of this.config.directableTypes) {
			const spec = registry.getNodeSpec(type);
			if (!spec) continue;

			if (spec.attrs?.dir) continue;

			const originalToDOM = spec.toDOM;

			registry.removeNodeSpec(type);
			registry.registerNodeSpec({
				...spec,
				attrs: {
					...spec.attrs,
					dir: { default: 'auto' },
				},
				toDOM(node) {
					const el = originalToDOM.call(spec, node);
					applyDirection(el, node);
					return el;
				},
			});
		}
	}

	// --- Inline <bdi> Mark ---

	private registerBdiMark(context: PluginContext): void {
		context.registerMarkSpec({
			type: 'bdi',
			rank: 10,
			attrs: {
				dir: { default: 'auto' },
			},
			toDOM(mark) {
				const el: HTMLElement = document.createElement('bdi');
				const dir: string = String(mark.attrs?.dir ?? 'auto');
				el.setAttribute('dir', dir);
				return el;
			},
			toHTMLString: (mark, content) => {
				const dir: string = escapeHTML(String(mark.attrs?.dir ?? 'auto'));
				return `<bdi dir="${dir}">${content}</bdi>`;
			},
			parseHTML: [
				{
					tag: 'bdi',
					getAttrs: (el) => {
						const dir: string | null = el.getAttribute('dir');
						if (dir === 'ltr' || dir === 'rtl') return { dir };
						return { dir: 'auto' };
					},
				},
			],
			sanitize: { tags: ['bdi'], attrs: ['dir'] },
		});
	}

	// --- Commands ---

	private registerCommands(context: PluginContext): void {
		context.registerCommand('setDirectionLTR', () => {
			const result: boolean = this.setDirection(context, 'ltr');
			if (result) context.announce(this.locale.announceLTR);
			return result;
		});

		context.registerCommand('setDirectionRTL', () => {
			const result: boolean = this.setDirection(context, 'rtl');
			if (result) context.announce(this.locale.announceRTL);
			return result;
		});

		context.registerCommand('setDirectionAuto', () => {
			const result: boolean = this.setDirection(context, 'auto');
			if (result) context.announce(this.locale.announceAuto);
			return result;
		});

		context.registerCommand('toggleBidiLTR', () => {
			const result: boolean = this.applyBdi(context, 'ltr');
			if (result) context.announce(this.locale.inlineLTR);
			return result;
		});

		context.registerCommand('toggleBidiRTL', () => {
			const result: boolean = this.applyBdi(context, 'rtl');
			if (result) context.announce(this.locale.inlineRTL);
			return result;
		});

		context.registerCommand('toggleBidiAuto', () => {
			const result: boolean = this.applyBdi(context, 'auto');
			if (result) context.announce(this.locale.inlineAuto);
			return result;
		});

		context.registerCommand('removeBidi', () => {
			const result: boolean = this.removeBdi(context);
			if (result) context.announce(this.locale.announceRemoveBidi);
			return result;
		});

		context.registerCommand('toggleBidiIsolation', () => {
			return this.toggleBidiIsolation(context);
		});

		context.registerCommand('toggleDirection', () => {
			const state = context.getState();
			const block = getSelectedBlock(state);
			if (!block || !this.directableTypes.has(block.type)) return false;

			const current: TextDirection = getBlockDir(block);
			const next: TextDirection = current === 'auto' ? 'rtl' : current === 'rtl' ? 'ltr' : 'auto';
			return this.setDirection(context, next);
		});
	}

	// --- Keymaps ---

	private registerKeymaps(context: PluginContext): void {
		context.registerKeymap({
			'Mod-Shift-D': () => context.executeCommand('toggleDirection'),
			'Mod-Shift-B': () => context.executeCommand('toggleBidiIsolation'),
		});
	}

	// --- Toolbar ---

	private registerToolbarItem(context: PluginContext): void {
		const commandNames: Readonly<Record<TextDirection, string>> = {
			ltr: 'setDirectionLTR',
			rtl: 'setDirectionRTL',
			auto: 'setDirectionAuto',
		};

		const dropdownItems = ALL_DIRECTIONS.map((dir) => ({
			label: this.getDirectionLabel(dir),
			command: commandNames[dir],
			icon: DIRECTION_ICONS[dir],
		}));

		context.registerToolbarItem({
			id: 'text-direction',
			group: 'block',
			icon: DIRECTION_ICONS.auto,
			label: this.locale.toolbarLabel,
			tooltip: `${this.locale.toolbarTooltip} (${formatShortcut('Mod-Shift-D')})`,
			command: 'setDirectionAuto',
			priority: 65,
			popupType: 'dropdown',
			popupConfig: { items: dropdownItems },
			separatorAfter: this.config.separatorAfter,
			isActive: (state) => this.isNonDefaultDirection(state),
			isEnabled: (state) => this.isDirectable(state),
			getIcon: (state) => {
				const block = getSelectedBlock(state);
				if (!block) return DIRECTION_ICONS.auto;
				const dir: TextDirection = getBlockDir(block);
				return DIRECTION_ICONS[dir] ?? DIRECTION_ICONS.auto;
			},
		});
	}

	private registerInlineToolbarItem(context: PluginContext): void {
		const inlineItems = [
			{ label: this.locale.inlineLTR, command: 'toggleBidiLTR', icon: DIRECTION_ICONS.ltr },
			{ label: this.locale.inlineRTL, command: 'toggleBidiRTL', icon: DIRECTION_ICONS.rtl },
			{ label: this.locale.inlineAuto, command: 'toggleBidiAuto', icon: DIRECTION_ICONS.auto },
			{ label: this.locale.announceRemoveBidi, command: 'removeBidi' },
		];

		context.registerToolbarItem({
			id: 'inline-direction',
			group: 'format',
			icon: INLINE_BDI_ICON,
			label: this.locale.inlineLabel,
			tooltip: `${this.locale.inlineTooltip} (${formatShortcut('Mod-Shift-B')})`,
			command: 'toggleBidiIsolation',
			priority: 45,
			popupType: 'dropdown',
			popupConfig: { items: inlineItems },
			isActive: (state) => isAttributedMarkActive(state, 'bdi'),
			isEnabled: (state) => {
				const sel = state.selection;
				return isTextSelection(sel) && !isCollapsed(sel);
			},
		});
	}

	private getDirectionLabel(dir: TextDirection): string {
		if (dir === 'ltr') return this.locale.ltr;
		if (dir === 'rtl') return this.locale.rtl;
		return this.locale.auto;
	}

	// --- Direction Logic ---

	private setDirection(context: PluginContext, direction: TextDirection): boolean {
		const state = context.getState();
		const blockIds: BlockId[] = this.getSelectedBlockIds(state);
		if (blockIds.length === 0) return false;

		const tb = state.transaction('command');
		let changed = false;

		for (const id of blockIds) {
			const block = state.getBlock(id);
			if (!block || !this.directableTypes.has(block.type)) continue;

			const path = state.getNodePath(id);
			if (!path) continue;

			tb.setNodeAttr(path, { ...block.attrs, dir: direction });
			changed = true;
		}

		if (!changed) return false;

		const tr = tb.setSelection(state.selection).build();
		context.dispatch(tr);
		return true;
	}

	/**
	 * Returns all block IDs covered by the current selection.
	 * Only handles TextSelection and NodeSelection — other selection types
	 * (e.g. GapCursorSelection) return an empty array intentionally, since
	 * gap cursors sit between blocks and have no associated block content.
	 */
	private getSelectedBlockIds(state: EditorState): BlockId[] {
		const sel = state.selection;

		if (isNodeSelection(sel)) {
			return [sel.nodeId];
		}

		if (!isTextSelection(sel)) return [];

		const anchorId: BlockId = sel.anchor.blockId;
		const headId: BlockId = sel.head.blockId;

		if (anchorId === headId) return [anchorId];

		const order: readonly BlockId[] = state.getBlockOrder();
		const anchorIdx: number = order.indexOf(anchorId);
		const headIdx: number = order.indexOf(headId);
		if (anchorIdx === -1 || headIdx === -1) return [];

		const from: number = Math.min(anchorIdx, headIdx);
		const to: number = Math.max(anchorIdx, headIdx);
		return order.slice(from, to + 1) as BlockId[];
	}

	private isNonDefaultDirection(state: EditorState): boolean {
		const block = getSelectedBlock(state);
		if (!block || !this.directableTypes.has(block.type)) return false;
		const dir = block.attrs?.dir;
		return dir != null && dir !== 'auto';
	}

	private isDirectable(state: EditorState): boolean {
		const block = getSelectedBlock(state);
		return block != null && this.directableTypes.has(block.type);
	}

	// --- Inline bdi mark operations ---

	/**
	 * Cycles inline bidi isolation: no-bdi → bdi (opposite of block dir) →
	 * remove. Applies the opposite direction of the current block for the
	 * common case (e.g., LTR word in an RTL block gets bdi-ltr).
	 */
	private toggleBidiIsolation(context: PluginContext): boolean {
		const state = context.getState();
		if (isAttributedMarkActive(state, 'bdi')) {
			const result: boolean = this.removeBdi(context);
			if (result) context.announce(this.locale.announceRemoveBidi);
			return result;
		}
		const block = getSelectedBlock(state);
		const blockDir: TextDirection = block ? getBlockDir(block) : 'auto';
		const bdiDir: TextDirection = blockDir === 'rtl' ? 'ltr' : 'rtl';
		const result: boolean = this.applyBdi(context, bdiDir);
		if (result) {
			const announcement: string = bdiDir === 'ltr' ? this.locale.inlineLTR : this.locale.inlineRTL;
			context.announce(announcement);
		}
		return result;
	}

	private applyBdi(context: PluginContext, dir: TextDirection): boolean {
		const state = context.getState();
		const mark = { type: markType('bdi'), attrs: { dir } };
		const tr = applyAttributedMark(state, mark);
		if (!tr) return false;
		context.dispatch(tr);
		return true;
	}

	private removeBdi(context: PluginContext): boolean {
		const state = context.getState();
		const tr = removeAttributedMark(state, markType('bdi'));
		if (!tr) return false;
		context.dispatch(tr);
		return true;
	}
}

// --- Helpers ---

function applyDirection(el: HTMLElement, node: BlockNode): void {
	const dir = node.attrs?.dir;
	if (dir === 'ltr' || dir === 'rtl' || dir === 'auto') {
		el.setAttribute('dir', dir);
	}
}
