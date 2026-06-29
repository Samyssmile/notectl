/**
 * BlockquotePlugin: registers a blockquote block type with NodeSpec,
 * toggle command, keyboard shortcut, input rule, and a toolbar button.
 */

import {
	liftSelectionFromContainer,
	wrapSelectionInContainer,
} from '../../commands/ContainerCommands.js';
import type { BlockNode } from '../../model/Document.js';
import { createBlockNode, generateBlockId } from '../../model/Document.js';
import { hasAncestorOfType } from '../../model/NodeResolver.js';
import { isCollapsed, isTextSelection } from '../../model/Selection.js';
import { nodeType } from '../../model/TypeBrands.js';
import { createBlockElement } from '../../view/DomUtils.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import { formatShortcut } from '../shared/ShortcutFormatting.js';
import { registerBlockquoteKeymaps } from './BlockquoteKeyboardHandlers.js';
import {
	BLOCKQUOTE_LOCALE_EN,
	type BlockquoteLocale,
	loadBlockquoteLocale,
} from './BlockquoteLocale.js';
import { BLOCKQUOTE_CSS } from './BlockquoteStyles.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface NodeAttrRegistry {
		blockquote: Record<string, never>;
	}
}

// --- Configuration ---

export interface BlockquoteConfig {
	/** Live Markdown shortcut: `> ` to start a blockquote. Default true. */
	readonly inputRule?: boolean;
	readonly locale?: BlockquoteLocale;
}

const DEFAULT_CONFIG: BlockquoteConfig = {};

// --- Plugin ---

export class BlockquotePlugin implements Plugin {
	readonly id = 'blockquote';
	readonly name = 'Blockquote';
	readonly priority = 35;

	private readonly config: BlockquoteConfig;
	private locale!: BlockquoteLocale;

	constructor(config?: Partial<BlockquoteConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	async init(context: PluginContext): Promise<void> {
		this.locale = await resolveLocale(
			context,
			this.config.locale,
			BLOCKQUOTE_LOCALE_EN,
			loadBlockquoteLocale,
		);
		context.registerStyleSheet(BLOCKQUOTE_CSS);
		this.registerNodeSpec(context);
		this.registerCommands(context);
		this.registerKeymap(context);
		if (this.config.inputRule !== false) this.registerInputRule(context);
		this.registerToolbarItem(context);
	}

	private registerNodeSpec(context: PluginContext): void {
		context.registerNodeSpec({
			type: 'blockquote',
			group: 'block',
			// Container block (issue #136): a blockquote wraps other blocks, mirroring
			// HTML flow-content semantics. `isolating` is intentionally NOT set so the
			// caret can flow across the container boundary (unlike table_cell).
			content: {
				allow: ['paragraph', 'heading', 'list_item', 'blockquote', 'horizontal_rule', 'code_block'],
				min: 1,
			},
			toDOM(node) {
				const el = createBlockElement('blockquote', node.id);
				el.setAttribute('part', 'blockquote');
				return el;
			},
			toHTML(_node, content) {
				return `<blockquote>${content || '<br>'}</blockquote>`;
			},
			parseHTML: [{ tag: 'blockquote' }],
			sanitize: { tags: ['blockquote'] },
		});
	}

	private registerCommands(context: PluginContext): void {
		context.registerCommand('toggleBlockquote', () => {
			return this.toggleBlockquote(context);
		});

		context.registerCommand('setBlockquote', () => {
			return this.wrapInBlockquote(context);
		});
	}

	private registerKeymap(context: PluginContext): void {
		context.registerKeymap({
			'Mod-Shift->': () => context.executeCommand('toggleBlockquote'),
		});
		registerBlockquoteKeymaps(context);
	}

	private registerInputRule(context: PluginContext): void {
		context.registerInputRule({
			pattern: /^> $/,
			handler(state, _match, start, _end) {
				const sel = state.selection;
				if (!isTextSelection(sel)) return null;
				if (!isCollapsed(sel)) return null;

				const block = state.getBlock(sel.anchor.blockId);
				if (!block || block.type !== 'paragraph') return null;

				const index: number = state.doc.children.findIndex((b) => b.id === block.id);
				if (index < 0) return null;

				// B2: wrap the paragraph into a blockquote container, then strip the
				// "> " marker from the (now nested) paragraph in the same transaction.
				const container = createBlockNode(nodeType('blockquote'), [block], generateBlockId());
				return state
					.transaction('input')
					.removeNode([], index)
					.insertNode([], index, container)
					.deleteTextAt(sel.anchor.blockId, start, start + 2)
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
			label: this.locale.label,
			tooltip: this.locale.tooltip(formatShortcut('Mod-Shift->')),
			command: 'toggleBlockquote',
			isActive: (state) => {
				if (!isTextSelection(state.selection)) return false;
				return hasAncestorOfType(state.doc, state.selection.anchor.blockId, 'blockquote');
			},
		});
	}

	/**
	 * Toggles the blockquote container around the selection.
	 * If the selection already lives inside a blockquote, its blocks are lifted
	 * back out; otherwise the selected blocks are wrapped into one blockquote.
	 */
	private toggleBlockquote(context: PluginContext): boolean {
		const state = context.getState();
		const sel = state.selection;
		if (!isTextSelection(sel)) return false;

		const tr = hasAncestorOfType(state.doc, sel.anchor.blockId, 'blockquote')
			? liftSelectionFromContainer(state, nodeType('blockquote'), sel)
			: wrapSelectionInContainer(state, nodeType('blockquote'), sel, this.isQuoteChild(context));

		if (!tr) return false;
		context.dispatch(tr);
		return true;
	}

	/** Wraps the selected blocks into a blockquote container (no toggle-off). */
	private wrapInBlockquote(context: PluginContext): boolean {
		const state = context.getState();
		const sel = state.selection;
		if (!isTextSelection(sel)) return false;

		const tr = wrapSelectionInContainer(
			state,
			nodeType('blockquote'),
			sel,
			this.isQuoteChild(context),
		);
		if (!tr) return false;
		context.dispatch(tr);
		return true;
	}

	/**
	 * Builds a predicate that reports whether a block may legally become a direct
	 * child of the blockquote container, derived from the registered NodeSpec's
	 * `content.allow` (single source of truth). Matches both concrete child types
	 * and group names (e.g. `block`), so blocks the quote cannot hold (e.g. a
	 * `table`) are excluded rather than nested into an invalid document.
	 */
	private isQuoteChild(context: PluginContext): (block: BlockNode) => boolean {
		const registry = context.getSchemaRegistry();
		const allow: ReadonlySet<string> = new Set(
			registry.getNodeSpec(nodeType('blockquote'))?.content?.allow ?? [],
		);
		return (block: BlockNode): boolean => {
			if (allow.has(block.type)) return true;
			const group: string | undefined = registry.getNodeSpec(block.type)?.group;
			return group !== undefined && allow.has(group);
		};
	}
}
