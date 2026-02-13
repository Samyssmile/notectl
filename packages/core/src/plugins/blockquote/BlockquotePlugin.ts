/**
 * BlockquotePlugin: registers a blockquote block type with NodeSpec,
 * toggle command, keyboard shortcut, input rule, and a toolbar button.
 */

import { createBlockElement } from '../../model/NodeSpec.js';
import { isCollapsed, isNodeSelection } from '../../model/Selection.js';
import { type NodeTypeName, nodeType } from '../../model/TypeBrands.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { formatShortcut } from '../toolbar/ToolbarItem.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface NodeAttrRegistry {
		blockquote: Record<string, never>;
	}
}

// --- Configuration ---

export interface BlockquoteConfig {
	/** When true, a separator is rendered after the blockquote toolbar item. */
	readonly separatorAfter?: boolean;
}

const DEFAULT_CONFIG: BlockquoteConfig = {};

// --- Plugin ---

export class BlockquotePlugin implements Plugin {
	readonly id = 'blockquote';
	readonly name = 'Blockquote';
	readonly priority = 35;

	private readonly config: BlockquoteConfig;

	constructor(config?: Partial<BlockquoteConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	init(context: PluginContext): void {
		this.registerNodeSpec(context);
		this.registerCommands(context);
		this.registerKeymap(context);
		this.registerInputRule(context);
		this.registerToolbarItem(context);
	}

	private registerNodeSpec(context: PluginContext): void {
		context.registerNodeSpec({
			type: 'blockquote',
			group: 'block',
			content: { allow: ['text'] },
			toDOM(node) {
				return createBlockElement('blockquote', node.id);
			},
		});
	}

	private registerCommands(context: PluginContext): void {
		context.registerCommand('toggleBlockquote', () => {
			return this.toggleBlockquote(context);
		});

		context.registerCommand('setBlockquote', () => {
			return this.setBlockType(context, nodeType('blockquote'));
		});
	}

	private registerKeymap(context: PluginContext): void {
		context.registerKeymap({
			'Mod-Shift->': () => context.executeCommand('toggleBlockquote'),
		});
	}

	private registerInputRule(context: PluginContext): void {
		context.registerInputRule({
			pattern: /^> $/,
			handler(state, _match, start, _end) {
				const sel = state.selection;
				if (isNodeSelection(sel)) return null;
				if (!isCollapsed(sel)) return null;

				const block = state.getBlock(sel.anchor.blockId);
				if (!block || block.type !== 'paragraph') return null;

				return state
					.transaction('input')
					.deleteTextAt(sel.anchor.blockId, start, start + 2)
					.setBlockType(sel.anchor.blockId, nodeType('blockquote'))
					.setSelection(sel)
					.build();
			},
		});
	}

	private registerToolbarItem(context: PluginContext): void {
		const icon =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z"/></svg>';

		context.registerToolbarItem({
			id: 'blockquote',
			group: 'block',
			icon,
			label: 'Blockquote',
			tooltip: `Blockquote (${formatShortcut('Mod-Shift->')})`,
			command: 'toggleBlockquote',
			priority: 55,
			separatorAfter: this.config.separatorAfter,
			isActive: (state) => {
				if (isNodeSelection(state.selection)) return false;
				const block = state.getBlock(state.selection.anchor.blockId);
				return block?.type === 'blockquote';
			},
		});
	}

	/**
	 * Toggles between blockquote and paragraph.
	 * If the block is already a blockquote, resets to paragraph.
	 */
	private toggleBlockquote(context: PluginContext): boolean {
		const state = context.getState();
		if (isNodeSelection(state.selection)) return false;
		const block = state.getBlock(state.selection.anchor.blockId);
		if (!block) return false;

		if (block.type === 'blockquote') {
			return this.setBlockType(context, nodeType('paragraph'));
		}

		return this.setBlockType(context, nodeType('blockquote'));
	}

	private setBlockType(
		context: PluginContext,
		type: NodeTypeName,
		attrs?: Record<string, string | number | boolean>,
	): boolean {
		const state = context.getState();
		const sel = state.selection;
		if (isNodeSelection(sel)) return false;

		const tr = state
			.transaction('command')
			.setBlockType(sel.anchor.blockId, type, attrs)
			.setSelection(sel)
			.build();

		context.dispatch(tr);
		return true;
	}
}
