/**
 * Block-level text direction plugin.
 *
 * Patches NodeSpecs of directable block types to add a `dir` attribute
 * (`'ltr' | 'rtl' | 'auto'`), exposes commands and a toolbar dropdown
 * for changing block direction, registers a `Mod-Shift-D` keymap, and
 * (on Windows/Linux) attaches a `Ctrl+Shift` direction handler.
 *
 * Inline `<bdi>` isolation lives in {@link BidiIsolationPlugin}; the
 * auto-detect / inherit / preserve middlewares live in
 * {@link TextDirectionAutoPlugin}. Both consume the
 * {@link TextDirectionService} that this plugin registers.
 */

import type { BlockNode } from '../../model/Document.js';
import { isNodeSelection, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { isMac } from '../../platform/Platform.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { getSelectedBlock, resolveLocale } from '../shared/PluginHelpers.js';
import { formatShortcut } from '../shared/ShortcutFormatting.js';
import { getBlockDir } from './DirectionDetection.js';
import { DIRECTION_ICONS } from './DirectionIcons.js';
import { ShiftDirectionHandler } from './ShiftDirectionHandler.js';
import {
	TEXT_DIRECTION_LOCALE_EN,
	type TextDirectionLocale,
	loadTextDirectionLocale,
} from './TextDirectionLocale.js';
import {
	TEXT_DIRECTION_SERVICE_KEY,
	type TextDirection,
	type TextDirectionService,
} from './TextDirectionService.js';

export type { TextDirection };

export interface TextDirectionConfig {
	/** Block types that support direction. */
	readonly directableTypes: readonly string[];
	readonly locale?: TextDirectionLocale;
}

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

const ALL_DIRECTIONS: readonly TextDirection[] = ['ltr', 'rtl', 'auto'];

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
		this.locale = await resolveLocale(
			context,
			this.config.locale,
			TEXT_DIRECTION_LOCALE_EN,
			loadTextDirectionLocale,
		);

		this.directableTypes = new Set(this.config.directableTypes);
		this.patchNodeSpecs(context);
		this.registerCommands(context);
		this.registerKeymaps(context);
		this.registerToolbarItem(context);
		this.registerService(context);

		if (!isMac()) {
			this.shiftDirHandler = new ShiftDirectionHandler(context);
			this.shiftDirHandler.attach(context.getContainer());
		}
	}

	destroy(): void {
		this.shiftDirHandler?.detach();
		this.shiftDirHandler = null;
	}

	private registerService(context: PluginContext): void {
		const service: TextDirectionService = {
			directableTypes: this.directableTypes,
			getBlockDir,
		};
		context.registerService(TEXT_DIRECTION_SERVICE_KEY, service);
	}

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

		context.registerCommand('toggleDirection', () => {
			const state = context.getState();
			const block = getSelectedBlock(state);
			if (!block || !this.directableTypes.has(block.type)) return false;

			const current: TextDirection = getBlockDir(block);
			const next: TextDirection = current === 'auto' ? 'rtl' : current === 'rtl' ? 'ltr' : 'auto';
			return this.setDirection(context, next);
		});
	}

	private registerKeymaps(context: PluginContext): void {
		context.registerKeymap({
			'Mod-Shift-D': () => context.executeCommand('toggleDirection'),
		});
	}

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
			popupType: 'dropdown',
			popupConfig: { items: dropdownItems },
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

	private getDirectionLabel(dir: TextDirection): string {
		if (dir === 'ltr') return this.locale.ltr;
		if (dir === 'rtl') return this.locale.rtl;
		return this.locale.auto;
	}

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
}

function applyDirection(el: HTMLElement, node: BlockNode): void {
	const dir = node.attrs?.dir;
	if (dir === 'ltr' || dir === 'rtl' || dir === 'auto') {
		el.setAttribute('dir', dir);
	}
}
