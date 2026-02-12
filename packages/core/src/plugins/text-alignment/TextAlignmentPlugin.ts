/**
 * TextAlignmentPlugin: adds left/center/right/justify alignment as a block
 * attribute on paragraphs and headings. Patches their NodeSpecs to render
 * the `textAlign` attribute via inline `text-align` style and provides
 * toggle commands, keyboard shortcuts, and a toolbar dropdown.
 */

import type { BlockNode } from '../../model/Document.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';

// --- Public Types ---

export type TextAlignment = 'left' | 'center' | 'right' | 'justify';

export interface TextAlignmentConfig {
	/** Which alignments to expose. Defaults to all four. */
	readonly alignments: readonly TextAlignment[];
	/** Block types that support alignment. Defaults to paragraph + heading. */
	readonly alignableTypes: readonly string[];
	/** When true, a separator is rendered after the toolbar item. */
	readonly separatorAfter?: boolean;
}

// --- Constants ---

const DEFAULT_CONFIG: TextAlignmentConfig = {
	alignments: ['left', 'center', 'right', 'justify'],
	alignableTypes: ['paragraph', 'heading', 'title', 'subtitle'],
};

const ALIGNMENT_LABELS: Readonly<Record<TextAlignment, string>> = {
	left: 'Align Left',
	center: 'Align Center',
	right: 'Align Right',
	justify: 'Justify',
};

const ALIGNMENT_ICONS: Readonly<Record<TextAlignment, string>> = {
	left: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15 15H3v2h12v-2zm0-8H3v2h12V7zM3 13h18v-2H3v2zm0 8h18v-2H3v2zM3 3v2h18V3H3z"/></svg>',
	center:
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 15v2h10v-2H7zm-4 6h18v-2H3v2zm0-8h18v-2H3v2zm4-6v2h10V7H7zM3 3v2h18V3H3z"/></svg>',
	right:
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 21h18v-2H3v2zm6-4h12v-2H9v2zm-6-4h18v-2H3v2zm6-4h12V7H9v2zM3 3v2h18V3H3z"/></svg>',
	justify:
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zM3 3v2h18V3H3z"/></svg>',
};

// --- Plugin ---

export class TextAlignmentPlugin implements Plugin {
	readonly id = 'text-alignment';
	readonly name = 'Text Alignment';
	readonly priority = 90;

	private readonly config: TextAlignmentConfig;
	private alignableTypes!: ReadonlySet<string>;

	constructor(config?: Partial<TextAlignmentConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	init(context: PluginContext): void {
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
	 * `textAlign` attribute and render it as an inline style.
	 */
	private patchNodeSpecs(context: PluginContext): void {
		const registry = context.getSchemaRegistry();

		for (const type of this.config.alignableTypes) {
			const spec = registry.getNodeSpec(type);
			if (!spec) continue;

			const originalToDOM = spec.toDOM;

			registry.removeNodeSpec(type);
			registry.registerNodeSpec({
				...spec,
				attrs: {
					...spec.attrs,
					textAlign: { default: 'left' },
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
			label: ALIGNMENT_LABELS[alignment],
			command: `align${capitalize(alignment)}`,
			icon: ALIGNMENT_ICONS[alignment],
		}));

		context.registerToolbarItem({
			id: 'text-alignment',
			group: 'block',
			icon: ALIGNMENT_ICONS.left,
			label: 'Text Alignment',
			tooltip: 'Text Alignment',
			command: 'alignLeft',
			priority: 60,
			popupType: 'dropdown',
			popupConfig: { items: dropdownItems },
			separatorAfter: this.config.separatorAfter,
			isActive: (state) => this.isNonDefaultAlignment(state),
			isEnabled: (state) => this.isAlignable(state),
		});
	}

	// --- Middleware ---

	/**
	 * Preserves the `textAlign` attribute when other plugins change the block
	 * type (e.g. paragraph → heading) via `setBlockType`, which replaces attrs.
	 */
	private registerMiddleware(context: PluginContext): void {
		context.registerMiddleware((tr, _state, next) => {
			let patched = false;

			const patchedSteps = tr.steps.map((step) => {
				if (step.type !== 'setBlockType') return step;
				if (!this.alignableTypes.has(step.nodeType)) return step;

				const prevAlign = step.previousAttrs?.textAlign;
				if (!prevAlign || prevAlign === 'left') return step;

				// Carry forward textAlign into new attrs
				patched = true;
				return {
					...step,
					attrs: { ...step.attrs, textAlign: prevAlign },
				};
			});

			next(patched ? { ...tr, steps: patchedSteps } : tr);
		});
	}

	// --- Alignment Logic ---

	private setAlignment(context: PluginContext, alignment: TextAlignment): boolean {
		const state = context.getState();
		const sel = state.selection;
		const block = state.getBlock(sel.anchor.blockId);
		if (!block || !this.alignableTypes.has(block.type)) return false;

		const newAttrs = { ...block.attrs, textAlign: alignment };

		const tr = state
			.transaction('command')
			.setNodeAttr([sel.anchor.blockId], newAttrs)
			.setSelection(sel)
			.build();

		context.dispatch(tr);
		return true;
	}

	private isNonDefaultAlignment(state: EditorState): boolean {
		const block = state.getBlock(state.selection.anchor.blockId);
		if (!block || !this.alignableTypes.has(block.type)) return false;
		const align = block.attrs?.textAlign;
		return align != null && align !== 'left';
	}

	private isAlignable(state: EditorState): boolean {
		const block = state.getBlock(state.selection.anchor.blockId);
		return block != null && this.alignableTypes.has(block.type);
	}
}

// --- Helpers ---

function applyAlignment(el: HTMLElement, node: BlockNode): void {
	const align = node.attrs?.textAlign;
	if (typeof align === 'string' && align !== 'left') {
		el.style.textAlign = align;
	}
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
