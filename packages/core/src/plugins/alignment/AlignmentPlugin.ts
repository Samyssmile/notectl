/**
 * AlignmentPlugin: adds left/center/right/justify alignment as a block
 * attribute on paragraphs, headings, images, and other alignable types.
 * Patches their NodeSpecs to render the `align` attribute via inline
 * `text-align` style and provides toggle commands, keyboard shortcuts,
 * and a toolbar dropdown. Handles both TextSelection and NodeSelection.
 */

import { resolvePluginLocale } from '../../i18n/resolvePluginLocale.js';
import type { BlockNode } from '../../model/Document.js';
import { findNodePath } from '../../model/NodeResolver.js';
import { isNodeSelection, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import { setStyleProperty } from '../../style/StyleRuntime.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { ALIGNMENT_LOCALES, type AlignmentLocale } from './AlignmentLocale.js';

// --- Public Types ---

export type BlockAlignment = 'left' | 'center' | 'right' | 'justify';

export interface AlignmentConfig {
	/** Which alignments to expose. Defaults to all four. */
	readonly alignments: readonly BlockAlignment[];
	/** Block types that support alignment. Defaults to paragraph + heading + title + subtitle + table_cell + image. */
	readonly alignableTypes: readonly string[];
	/** Per-type default alignment (e.g. `{ image: 'center' }`). Falls back to `'left'`. */
	readonly defaults: Readonly<Record<string, BlockAlignment>>;
	/** When true, a separator is rendered after the toolbar item. */
	readonly separatorAfter?: boolean;
	readonly locale?: AlignmentLocale;
}

// --- Constants ---

const DEFAULT_CONFIG: AlignmentConfig = {
	alignments: ['left', 'center', 'right', 'justify'],
	alignableTypes: ['paragraph', 'heading', 'title', 'subtitle', 'table_cell', 'image'],
	defaults: { image: 'center' },
};

export const ALIGNMENT_ICONS: Readonly<Record<BlockAlignment, string>> = {
	left: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>',
	center:
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>',
	right:
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>',
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

	init(context: PluginContext): void {
		this.locale = resolvePluginLocale(ALIGNMENT_LOCALES, context, this.config.locale);

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
			const defaultAlign: BlockAlignment = this.config.defaults[type] ?? 'left';

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

		if (this.config.alignments.includes('left')) {
			bindings['Mod-Shift-L'] = () => context.executeCommand('alignLeft');
		}
		if (this.config.alignments.includes('center')) {
			bindings['Mod-Shift-E'] = () => context.executeCommand('alignCenter');
		}
		if (this.config.alignments.includes('right')) {
			bindings['Mod-Shift-R'] = () => context.executeCommand('alignRight');
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
			icon: ALIGNMENT_ICONS.left,
			label: this.locale.toolbarLabel,
			tooltip: this.locale.toolbarTooltip,
			command: 'alignLeft',
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
			left: this.locale.alignLeft,
			center: this.locale.alignCenter,
			right: this.locale.alignRight,
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
					if (!prevAlign || prevAlign === 'left') return step;

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

	/**
	 * Gets the selected block, handling both TextSelection and NodeSelection.
	 */
	private getSelectedBlock(state: EditorState): BlockNode | undefined {
		const sel = state.selection;
		if (isNodeSelection(sel)) {
			return state.getBlock(sel.nodeId);
		}
		if (isTextSelection(sel)) {
			return state.getBlock(sel.anchor.blockId);
		}
		return undefined;
	}

	/**
	 * Gets the block ID of the selected block, handling both selection types.
	 */
	private getSelectedBlockId(state: EditorState): BlockId | undefined {
		const sel = state.selection;
		if (isNodeSelection(sel)) return sel.nodeId;
		if (isTextSelection(sel)) return sel.anchor.blockId;
		return undefined;
	}

	private setAlignment(context: PluginContext, alignment: BlockAlignment): boolean {
		const state = context.getState();
		const block = this.getSelectedBlock(state);
		if (!block || !this.alignableTypes.has(block.type)) return false;

		const blockId = this.getSelectedBlockId(state);
		if (!blockId) return false;

		const path = findNodePath(state.doc, blockId);
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
		const block = this.getSelectedBlock(state);
		if (!block || !this.alignableTypes.has(block.type)) return false;
		const align = block.attrs?.align;
		const defaultAlign: BlockAlignment = this.config.defaults[block.type] ?? 'left';
		return align != null && align !== defaultAlign;
	}

	private isAlignable(state: EditorState): boolean {
		const block = this.getSelectedBlock(state);
		return block != null && this.alignableTypes.has(block.type);
	}
}

// --- Helpers ---

function applyAlignment(el: HTMLElement, node: BlockNode): void {
	const align = node.attrs?.align;
	if (typeof align === 'string' && align !== 'left') {
		setStyleProperty(el, 'textAlign', align);
	}
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
