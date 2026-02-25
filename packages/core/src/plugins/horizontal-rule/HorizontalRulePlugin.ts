/**
 * HorizontalRulePlugin: registers a horizontal rule (divider) void block type
 * with NodeSpec, insert command, input rule, keyboard shortcut, and toolbar button.
 */

import { resolvePluginLocale } from '../../i18n/resolvePluginLocale.js';
import { createBlockNode } from '../../model/Document.js';
import { createBlockElement } from '../../model/NodeSpec.js';
import {
	createCollapsedSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
} from '../../model/Selection.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { formatShortcut } from '../toolbar/ToolbarItem.js';
import { HORIZONTAL_RULE_LOCALES, type HorizontalRuleLocale } from './HorizontalRuleLocale.js';

// --- Attribute Registry Augmentation ---

declare module '../../model/AttrRegistry.js' {
	interface NodeAttrRegistry {
		horizontal_rule: Record<string, never>;
	}
}

// --- Configuration ---

export interface HorizontalRuleConfig {
	/** When true, a separator is rendered after the toolbar item. */
	readonly separatorAfter?: boolean;
	/** Locale override for user-facing strings. */
	readonly locale?: HorizontalRuleLocale;
}

const DEFAULT_CONFIG: HorizontalRuleConfig = {};

// --- Helpers ---

/** Finds the index of the cursor's block among top-level document children. */
function findBlockIndexForCursor(state: EditorState): number {
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return -1;
	return state.doc.children.findIndex((b) => b.id === sel.anchor.blockId);
}

// --- Plugin ---

export class HorizontalRulePlugin implements Plugin {
	readonly id = 'horizontal-rule';
	readonly name = 'Horizontal Rule';
	readonly priority = 40;

	private readonly config: HorizontalRuleConfig;
	private locale!: HorizontalRuleLocale;

	constructor(config?: Partial<HorizontalRuleConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	init(context: PluginContext): void {
		this.locale = resolvePluginLocale(HORIZONTAL_RULE_LOCALES, context, this.config.locale);
		this.registerNodeSpec(context);
		this.registerCommands(context);
		this.registerKeymap(context);
		this.registerInputRule(context);
		this.registerToolbarItem(context);
	}

	private registerNodeSpec(context: PluginContext): void {
		context.registerNodeSpec({
			type: 'horizontal_rule',
			group: 'block',
			isVoid: true,
			toDOM(node) {
				return createBlockElement('hr', node.id);
			},
			toHTML() {
				return '<hr>';
			},
			parseHTML: [{ tag: 'hr' }],
			sanitize: { tags: ['hr'] },
		});
	}

	private registerCommands(context: PluginContext): void {
		context.registerCommand('insertHorizontalRule', () => {
			return this.insertHorizontalRule(context);
		});
	}

	private registerKeymap(context: PluginContext): void {
		context.registerKeymap({
			'Mod-Shift-H': () => context.executeCommand('insertHorizontalRule'),
		});
	}

	private registerInputRule(context: PluginContext): void {
		context.registerInputRule({
			pattern: /^-{3,} $/,
			handler(state, _match, _start, end) {
				const sel = state.selection;
				if (isNodeSelection(sel) || isGapCursor(sel)) return null;
				if (!isCollapsed(sel)) return null;

				const block = state.getBlock(sel.anchor.blockId);
				if (!block || block.type !== 'paragraph') return null;

				const blockIndex: number = findBlockIndexForCursor(state);
				if (blockIndex === -1) return null;

				const newParagraph = createBlockNode(nodeType('paragraph'));

				return state
					.transaction('input')
					.deleteTextAt(sel.anchor.blockId, 0, end)
					.setBlockType(sel.anchor.blockId, nodeType('horizontal_rule'))
					.insertNode([], blockIndex + 1, newParagraph)
					.setSelection(createCollapsedSelection(newParagraph.id, 0))
					.build();
			},
		});
	}

	private registerToolbarItem(context: PluginContext): void {
		const icon =
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 11h16v2H4z"/></svg>';

		context.registerToolbarItem({
			id: 'horizontal-rule',
			group: 'block',
			icon,
			label: this.locale.label,
			tooltip: this.locale.tooltip(formatShortcut('Mod-Shift-H')),
			command: 'insertHorizontalRule',
			priority: 60,
			separatorAfter: this.config.separatorAfter,
			isActive: () => false,
		});
	}

	/**
	 * Inserts a horizontal rule after the current block,
	 * followed by a new paragraph for continued editing.
	 */
	private insertHorizontalRule(context: PluginContext): boolean {
		const state: EditorState = context.getState();
		if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return false;
		const blockIndex: number = findBlockIndexForCursor(state);
		if (blockIndex === -1) return false;

		const hrBlock = createBlockNode(nodeType('horizontal_rule'));
		const newParagraph = createBlockNode(nodeType('paragraph'));

		const tr = state
			.transaction('command')
			.insertNode([], blockIndex + 1, hrBlock)
			.insertNode([], blockIndex + 2, newParagraph)
			.setSelection(createCollapsedSelection(newParagraph.id, 0))
			.build();

		context.dispatch(tr);
		return true;
	}
}
