/**
 * CodeBlockPlugin: orchestrates code block registration by delegating to
 * focused modules for keyboard handling, commands, and service API.
 *
 * Inline responsibilities: NodeSpec, NodeView, InputRule, Toolbar,
 * Middleware, Decorations, and lifecycle hooks (focus tracking).
 */

import type { DecorationSet } from '../../decorations/Decoration.js';
import { inline as inlineDecoration } from '../../decorations/Decoration.js';
import { DecorationSet as DecorationSetClass } from '../../decorations/Decoration.js';
import { CODE_BLOCK_CSS } from '../../editor/styles/code-block.js';
import { resolvePluginLocale } from '../../i18n/resolvePluginLocale.js';
import type { BlockNode } from '../../model/Document.js';
import { getBlockText } from '../../model/Document.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import { createBlockElement } from '../../model/NodeSpec.js';
import { createCollapsedSelection, isCollapsed, isNodeSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { formatShortcut } from '../toolbar/ToolbarItem.js';
import { registerCodeBlockCommands } from './CodeBlockCommands.js';
import { registerCodeBlockKeymaps } from './CodeBlockKeyboardHandlers.js';
import { CODE_BLOCK_LOCALES, type CodeBlockLocale } from './CodeBlockLocale.js';
import { createCodeBlockNodeViewFactory } from './CodeBlockNodeView.js';
import { registerCodeBlockService } from './CodeBlockService.js';
import type { CodeBlockConfig, CodeBlockKeymap, SyntaxToken } from './CodeBlockTypes.js';
import { CODE_BLOCK_ICON, DEFAULT_CONFIG, DEFAULT_KEYMAP } from './CodeBlockTypes.js';

// Re-exports for backward compatibility
export {
	CODE_BLOCK_SERVICE_KEY,
	type CodeBlockConfig,
	type CodeBlockKeymap,
	type CodeBlockService,
	type SyntaxHighlighter,
	type SyntaxToken,
} from './CodeBlockTypes.js';

export class CodeBlockPlugin implements Plugin {
	readonly id = 'code-block';
	readonly name = 'Code Block';
	readonly priority = 36;

	private readonly config: CodeBlockConfig;
	private readonly resolvedKeymap: Readonly<Record<keyof CodeBlockKeymap, string | null>>;
	private context: PluginContext | null = null;
	private locale!: CodeBlockLocale;

	constructor(config?: Partial<CodeBlockConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.resolvedKeymap = {
			...DEFAULT_KEYMAP,
			...config?.keymap,
		};
	}

	init(context: PluginContext): void {
		this.locale = resolvePluginLocale(CODE_BLOCK_LOCALES, context, this.config.locale);
		context.registerStyleSheet(CODE_BLOCK_CSS);
		this.context = context;

		this.registerNodeSpec(context);
		this.registerNodeView(context);
		registerCodeBlockCommands(context, this.config);
		registerCodeBlockKeymaps(context, this.config, this.resolvedKeymap);
		this.registerInputRule(context);
		this.registerToolbarItem(context);
		this.registerMiddleware(context);
		registerCodeBlockService(context, this.config, () => this.context);
		this.patchTableCellContent(context);
	}

	destroy(): void {
		this.context = null;
	}

	onStateChange(oldState: EditorState, newState: EditorState, _tr: Transaction): void {
		if (!this.context) return;

		const oldBlockId: BlockId | null = isNodeSelection(oldState.selection)
			? null
			: oldState.selection.anchor.blockId;
		const newBlockId: BlockId | null = isNodeSelection(newState.selection)
			? null
			: newState.selection.anchor.blockId;

		const oldBlock: BlockNode | undefined = oldBlockId ? oldState.getBlock(oldBlockId) : undefined;
		const newBlock: BlockNode | undefined = newBlockId ? newState.getBlock(newBlockId) : undefined;

		const wasInCode: boolean = oldBlock?.type === 'code_block';
		const nowInCode: boolean = newBlock?.type === 'code_block';

		if (wasInCode && oldBlockId) {
			this.setBlockFocused(oldBlockId, false);
		}
		if (nowInCode && newBlockId) {
			this.setBlockFocused(newBlockId, true);
		}

		if (!wasInCode && nowInCode) {
			this.context.announce(this.locale.enteredCodeBlock);
		} else if (wasInCode && !nowInCode) {
			this.context.announce(this.locale.leftCodeBlock);
		}
	}

	decorations(state: EditorState): DecorationSet {
		if (!this.config.highlighter) return DecorationSetClass.empty;

		const decorations: ReturnType<typeof inlineDecoration>[] = [];
		const highlighter = this.config.highlighter;

		for (const bid of state.getBlockOrder()) {
			const block: BlockNode | undefined = state.getBlock(bid);
			if (!block || block.type !== 'code_block') continue;

			const lang: string = (block.attrs?.language as string) ?? '';
			if (!lang) continue;

			const text: string = getBlockText(block);
			if (!text) continue;

			const tokens: readonly SyntaxToken[] = highlighter.tokenize(text, lang);
			for (const token of tokens) {
				decorations.push(
					inlineDecoration(bid, token.from, token.to, {
						class: `notectl-token--${token.type}`,
					}),
				);
			}
		}

		return DecorationSetClass.create(decorations);
	}

	// --- NodeSpec ---

	private registerNodeSpec(context: PluginContext): void {
		context.registerNodeSpec({
			type: 'code_block',
			group: 'block',
			content: { allow: ['text'] },
			selectable: true,
			attrs: {
				language: { default: '' },
				backgroundColor: { default: '' },
			},
			toDOM(node) {
				const pre: HTMLElement = createBlockElement('pre', node.id);
				pre.className = 'notectl-code-block';
				const code: HTMLElement = document.createElement('code');
				code.className = 'notectl-code-block__content';
				pre.appendChild(code);
				return pre;
			},
			toHTML(node, content) {
				const lang: string = escapeHTML((node.attrs?.language as string) ?? '');
				const bg: string = escapeHTML((node.attrs?.backgroundColor as string) ?? '');
				const langAttr: string = lang ? ` data-language="${lang}"` : '';
				const bgStyle: string = bg ? ` style="background-color: ${bg}"` : '';
				return `<pre${bgStyle}><code${langAttr}>${content || ''}</code></pre>`;
			},
			parseHTML: [
				{
					tag: 'pre',
					getAttrs(el: HTMLElement) {
						const code: HTMLElement | null = el.querySelector('code');
						const langClass: string = code?.className.match(/language-(\S+)/)?.[1] ?? '';
						const dataLang: string = code?.getAttribute('data-language') ?? '';
						return {
							language: dataLang || langClass,
						};
					},
				},
			],
			sanitize: {
				tags: ['pre', 'code'],
				attrs: ['data-language', 'class', 'style'],
			},
		});
	}

	// --- NodeView ---

	private registerNodeView(context: PluginContext): void {
		context.registerNodeView('code_block', createCodeBlockNodeViewFactory(this.config));
	}

	// --- Input Rule ---

	private registerInputRule(context: PluginContext): void {
		context.registerInputRule({
			pattern: /^```(\w*) $/,
			handler: (state, match, start, _end) => {
				const sel = state.selection;
				if (isNodeSelection(sel)) return null;
				if (!isCollapsed(sel)) return null;

				const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
				if (!block || block.type !== 'paragraph') return null;

				const language: string = match[1] ?? '';
				const attrs: Record<string, string | number | boolean> = {
					language,
					backgroundColor: '',
				};

				return state
					.transaction('input')
					.deleteTextAt(sel.anchor.blockId, start, start + match[0].length)
					.setBlockType(sel.anchor.blockId, nodeType('code_block'), attrs)
					.setSelection(createCollapsedSelection(sel.anchor.blockId, 0))
					.build();
			},
		});
	}

	// --- Toolbar ---

	private registerToolbarItem(context: PluginContext): void {
		context.registerToolbarItem({
			id: 'code_block',
			group: 'block',
			icon: CODE_BLOCK_ICON,
			label: this.locale.label,
			tooltip: this.locale.tooltip(
				this.resolvedKeymap.toggle ? formatShortcut(this.resolvedKeymap.toggle) : undefined,
			),
			command: 'toggleCodeBlock',
			priority: 56,
			separatorAfter: this.config.separatorAfter,
			isActive: (state) => {
				if (isNodeSelection(state.selection)) return false;
				const block: BlockNode | undefined = state.getBlock(state.selection.anchor.blockId);
				return block?.type === 'code_block';
			},
		});
	}

	// --- Middleware (Mark Prevention) ---

	private registerMiddleware(context: PluginContext): void {
		context.registerMiddleware(
			(tr, state, next) => {
				const hasMarkInCodeBlock: boolean = tr.steps.some((step) => {
					if (step.type !== 'addMark') return false;
					const block: BlockNode | undefined = state.getBlock(step.blockId);
					return block?.type === 'code_block';
				});

				if (!hasMarkInCodeBlock) {
					next(tr);
					return;
				}

				const filtered = tr.steps.filter((step) => {
					if (step.type !== 'addMark') return true;
					const block: BlockNode | undefined = state.getBlock(step.blockId);
					return block?.type !== 'code_block';
				});

				next({ ...tr, steps: filtered });
			},
			{ name: 'code-block:mark-guard', priority: 50 },
		);
	}

	// --- Table Cell Patching ---

	private patchTableCellContent(context: PluginContext): void {
		const registry = context.getSchemaRegistry();
		const cellSpec = registry.getNodeSpec('table_cell');
		if (!cellSpec?.content) return;

		const currentAllow: readonly string[] = cellSpec.content.allow ?? [];
		if (currentAllow.includes('code_block')) return;

		registry.removeNodeSpec('table_cell');
		registry.registerNodeSpec({
			...cellSpec,
			content: {
				...cellSpec.content,
				allow: [...currentAllow, 'code_block'],
			},
		});
	}

	// --- Helpers ---

	private setBlockFocused(bid: BlockId, focused: boolean): void {
		if (!this.context) return;
		const container: HTMLElement = this.context.getContainer();
		const el: Element | null = container.querySelector(`[data-block-id="${bid}"]`);
		if (el) {
			el.classList.toggle('notectl-code-block--focused', focused);
		}
	}
}
