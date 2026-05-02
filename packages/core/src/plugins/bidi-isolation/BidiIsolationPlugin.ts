/**
 * Inline bidi isolation plugin: registers a `<bdi>` mark and the inline
 * commands / toolbar / keymap that wrap selected text in a `<bdi>` element
 * with an explicit `dir` attribute.
 *
 * Use alongside {@link TextDirectionPlugin} for the full RTL story:
 * block-level direction lives there, the optional `TextDirectionService`
 * lets this plugin pick the inline direction opposite to the block direction
 * in `toggleBidiIsolation`. Without `TextDirectionPlugin`, this plugin
 * still works — `toggleBidiIsolation` falls back to applying `'rtl'`.
 */

import {
	applyAttributedMark,
	isAttributedMarkActive,
	removeAttributedMark,
} from '../../commands/AttributedMarkCommands.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import { isCollapsed, isTextSelection } from '../../model/Selection.js';
import { markType } from '../../model/TypeBrands.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { getSelectedBlock, resolveLocale } from '../shared/PluginHelpers.js';
import { formatShortcut } from '../shared/ShortcutFormatting.js';
import { DIRECTION_ICONS } from '../text-direction/DirectionIcons.js';
import {
	TEXT_DIRECTION_SERVICE_KEY,
	type TextDirection,
	type TextDirectionService,
} from '../text-direction/TextDirectionService.js';
import {
	BIDI_ISOLATION_LOCALE_EN,
	type BidiIsolationLocale,
	loadBidiIsolationLocale,
} from './BidiIsolationLocale.js';

declare module '../../model/AttrRegistry.js' {
	interface MarkAttrRegistry {
		bdi: { dir: 'ltr' | 'rtl' | 'auto' };
	}
}

export interface BidiIsolationConfig {
	readonly locale?: BidiIsolationLocale;
}

const INLINE_BDI_ICON: string =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 4v7h2V4h2v7h2V4h1V2H10a3 3 0 1 0 0 6zm-3.5 9.5L3 17l3.5 3.5V18h3v-2h-3v-2.5zm14 0L17 17l3.5 3.5V18h-3v-2h3v-2.5zM11 16h2v6h-2z"/></svg>';

export class BidiIsolationPlugin implements Plugin {
	readonly id = 'bidi-isolation';
	readonly name = 'Bidi Isolation';
	readonly priority = 92;

	private readonly config: BidiIsolationConfig;
	private locale!: BidiIsolationLocale;

	constructor(config?: Partial<BidiIsolationConfig>) {
		this.config = { ...config };
	}

	async init(context: PluginContext): Promise<void> {
		this.locale = await resolveLocale(
			context,
			this.config.locale,
			BIDI_ISOLATION_LOCALE_EN,
			loadBidiIsolationLocale,
		);

		this.registerBdiMark(context);
		this.registerCommands(context);
		this.registerKeymaps(context);
		this.registerInlineToolbarItem(context);
	}

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

	private registerCommands(context: PluginContext): void {
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
	}

	private registerKeymaps(context: PluginContext): void {
		context.registerKeymap({
			'Mod-Shift-B': () => context.executeCommand('toggleBidiIsolation'),
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
			popupType: 'dropdown',
			popupConfig: { items: inlineItems },
			isActive: (state) => isAttributedMarkActive(state, 'bdi'),
			isEnabled: (state) => {
				const sel = state.selection;
				return isTextSelection(sel) && !isCollapsed(sel);
			},
		});
	}

	/**
	 * Cycles inline bidi isolation: no-bdi → bdi (opposite of block dir) →
	 * remove. When the {@link TextDirectionService} is registered, picks the
	 * direction opposite to the current block; otherwise defaults to `'rtl'`.
	 */
	private toggleBidiIsolation(context: PluginContext): boolean {
		const state = context.getState();
		if (isAttributedMarkActive(state, 'bdi')) {
			const result: boolean = this.removeBdi(context);
			if (result) context.announce(this.locale.announceRemoveBidi);
			return result;
		}

		const block = getSelectedBlock(state);
		const directionService: TextDirectionService | undefined = context.getService(
			TEXT_DIRECTION_SERVICE_KEY,
		);
		const blockDir: TextDirection =
			block && directionService ? directionService.getBlockDir(block) : 'auto';
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
