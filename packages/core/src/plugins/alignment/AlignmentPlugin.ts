/**
 * AlignmentPlugin: adds start/center/end/justify alignment as a block
 * attribute on paragraphs, headings, images, and other alignable types.
 * Uses logical values (`start`/`end`) instead of physical (`left`/`right`)
 * for correct behavior with RTL text direction. Patches NodeSpecs to render
 * the `align` attribute via inline `text-align` style and provides toggle
 * commands, keyboard shortcuts, and a toolbar dropdown.
 */

import { LocaleServiceKey } from '../../i18n/LocaleService.js';
import type { BlockAlignment } from '../../model/BlockAlignment.js';
import type { BlockNode } from '../../model/Document.js';
import { findNodePath } from '../../model/NodeResolver.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import { setStyleProperty } from '../../style/StyleRuntime.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { capitalize, getSelectedBlock, getSelectedBlockId } from '../shared/PluginHelpers.js';
import {
	ALIGNMENT_LOCALE_EN,
	type AlignmentLocale,
	loadAlignmentLocale,
} from './AlignmentLocale.js';

// --- Public Types ---

export type { BlockAlignment } from '../../model/BlockAlignment.js';

export interface AlignmentConfig {
	/** Which alignments to expose. Defaults to all four. */
	readonly alignments: readonly BlockAlignment[];
	/** Block types that support alignment. Defaults to paragraph + heading + title + subtitle + table_cell + image. */
	readonly alignableTypes: readonly string[];
	/** Per-type default alignment (e.g. `{ image: 'center' }`). Falls back to `'start'`. */
	readonly defaults: Readonly<Record<string, BlockAlignment>>;
	/** When true, a separator is rendered after the toolbar item. */
	readonly separatorAfter?: boolean;
	readonly locale?: AlignmentLocale;
}

// --- Constants ---

const DEFAULT_CONFIG: AlignmentConfig = {
	alignments: ['start', 'center', 'end', 'justify'],
	alignableTypes: ['paragraph', 'heading', 'title', 'subtitle', 'table_cell', 'image'],
	defaults: { image: 'center' },
};

export const ALIGNMENT_ICONS: Readonly<Record<BlockAlignment, string>> = {
	start:
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>',
	center:
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>',
	end: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>',
	justify:
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zM3 3v2h18V3H3z"/></svg>',
};

// --- Plugin ---

export class AlignmentPlugin implements Plugin {
	readonly id = 'alignment';
	readonly name = 'Alignment';
	readonly priority = 90;

	private readonly config: AlignmentConfig;
	private locale!: AlignmentLocale;
	private alignableTypes!: ReadonlySet<string>;

	constructor(config?: Partial<AlignmentConfig>) {
		this.config = {
			...DEFAULT_CONFIG,
			...config,
			defaults: { ...DEFAULT_CONFIG.defaults, ...config?.defaults },
		};
	}

	async init(context: PluginContext): Promise<void> {
		if (this.config.locale) {
			this.locale = this.config.locale;
		} else {
			const service = context.getService(LocaleServiceKey);
			const lang: string = service?.getLocale() ?? 'en';
			this.locale = lang === 'en' ? ALIGNMENT_LOCALE_EN : await loadAlignmentLocale(lang);
		}

		this.alignableTypes = new Set(this.config.alignableTypes);
		this.patchNodeSpecs(context);
		this.registerCommands(context);
		this.registerKeymaps(context);
		this.registerToolbarItem(context);
		this.registerMiddleware(context);
	}

	// --- NodeSpec Patching ---

	/**
	 * Patches existing NodeSpecs for alignable block types to support the
	 * `align` attribute and render it as an inline style. Skips types
	 * that already define an `align` attribute in their spec.
	 */
	private patchNodeSpecs(context: PluginContext): void {
		const registry = context.getSchemaRegistry();

		for (const type of this.config.alignableTypes) {
			const spec = registry.getNodeSpec(type);
			if (!spec) continue;

			// Skip types that already declare an `align` attr (e.g. image)
			if (spec.attrs?.align) continue;

			const originalToDOM = spec.toDOM;
			const defaultAlign: BlockAlignment = this.config.defaults[type] ?? 'start';

			registry.removeNodeSpec(type);
			registry.registerNodeSpec({
				...spec,
				attrs: {
					...spec.attrs,
					align: { default: defaultAlign },
				},
				toDOM(node) {
					const el = originalToDOM.call(spec, node);
					applyAlignment(el, node);
					return el;
				},
			});
		}
	}

	// --- Commands ---

	private registerCommands(context: PluginContext): void {
		for (const alignment of this.config.alignments) {
			context.registerCommand(`align${capitalize(alignment)}`, () => {
				return this.setAlignment(context, alignment);
			});
		}
	}

	// --- Keymaps ---

	private registerKeymaps(context: PluginContext): void {
		const bindings: Record<string, () => boolean> = {};

		if (this.config.alignments.includes('start')) {
			bindings['Mod-Shift-L'] = () => context.executeCommand('alignStart');
		}
		if (this.config.alignments.includes('center')) {
			bindings['Mod-Shift-E'] = () => context.executeCommand('alignCenter');
		}
		if (this.config.alignments.includes('end')) {
			bindings['Mod-Shift-R'] = () => context.executeCommand('alignEnd');
		}
		if (this.config.alignments.includes('justify')) {
			bindings['Mod-Shift-J'] = () => context.executeCommand('alignJustify');
		}

		if (Object.keys(bindings).length > 0) {
			context.registerKeymap(bindings);
		}
	}

	// --- Toolbar ---

	private registerToolbarItem(context: PluginContext): void {
		const dropdownItems = this.config.alignments.map((alignment) => ({
			label: this.getAlignmentLabel(alignment),
			command: `align${capitalize(alignment)}`,
			icon: ALIGNMENT_ICONS[alignment],
		}));

		context.registerToolbarItem({
			id: 'alignment',
			group: 'block',
			icon: ALIGNMENT_ICONS.start,
			label: this.locale.toolbarLabel,
			tooltip: this.locale.toolbarTooltip,
			command: 'alignStart',
			priority: 60,
			popupType: 'dropdown',
			popupConfig: { items: dropdownItems },
			separatorAfter: this.config.separatorAfter,
			isActive: (state) => this.isNonDefaultAlignment(state),
			isEnabled: (state) => this.isAlignable(state),
		});
	}

	private getAlignmentLabel(alignment: BlockAlignment): string {
		const labels: Record<BlockAlignment, string> = {
			start: this.locale.alignStart,
			center: this.locale.alignCenter,
			end: this.locale.alignEnd,
			justify: this.locale.justify,
		};
		return labels[alignment];
	}

	// --- Middleware ---

	/**
	 * Preserves the `align` attribute when other plugins change the block
	 * type (e.g. paragraph → heading) via `setBlockType`, which replaces attrs.
	 */
	private registerMiddleware(context: PluginContext): void {
		context.registerMiddleware(
			(tr, _state, next) => {
				let patched = false;

				const patchedSteps = tr.steps.map((step) => {
					if (step.type !== 'setBlockType') return step;
					if (!this.alignableTypes.has(step.nodeType)) return step;

					const prevAlign = step.previousAttrs?.align;
					if (!prevAlign || prevAlign === 'start') return step;

					// Carry forward align into new attrs
					patched = true;
					return {
						...step,
						attrs: { ...step.attrs, align: prevAlign },
					};
				});

				next(patched ? { ...tr, steps: patchedSteps } : tr);
			},
			{ name: 'alignment:preserve-align' },
		);
	}

	// --- Alignment Logic ---

	private setAlignment(context: PluginContext, alignment: BlockAlignment): boolean {
		const state = context.getState();
		const block = getSelectedBlock(state);
		if (!block || !this.alignableTypes.has(block.type)) return false;

		const id = getSelectedBlockId(state);
		if (!id) return false;

		const path = findNodePath(state.doc, id);
		if (!path) return false;

		const newAttrs = { ...block.attrs, align: alignment };

		const tr = state
			.transaction('command')
			.setNodeAttr(path as BlockId[], newAttrs)
			.setSelection(state.selection)
			.build();

		context.dispatch(tr);
		return true;
	}

	private isNonDefaultAlignment(state: EditorState): boolean {
		const block = getSelectedBlock(state);
		if (!block || !this.alignableTypes.has(block.type)) return false;
		const align = block.attrs?.align;
		const defaultAlign: BlockAlignment = this.config.defaults[block.type] ?? 'start';
		return align != null && align !== defaultAlign;
	}

	private isAlignable(state: EditorState): boolean {
		const block = getSelectedBlock(state);
		return block != null && this.alignableTypes.has(block.type);
	}
}

// --- Helpers ---

function applyAlignment(el: HTMLElement, node: BlockNode): void {
	const align = node.attrs?.align;
	if (typeof align === 'string' && align !== 'start') {
		setStyleProperty(el, 'textAlign', align);
	}
}
