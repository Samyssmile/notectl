/**
 * CodeBlockPlugin: orchestrates code block registration by delegating to
 * focused modules for keyboard handling, commands, and service API.
 *
 * Inline responsibilities: NodeSpec, NodeView, InputRule, Toolbar,
 * Middleware, Decorations, and lifecycle hooks (focus tracking).
 */

import type { Decoration, DecorationSet } from '../../decorations/Decoration.js';
import {
	inline as inlineDecoration,
	node as nodeDecoration,
} from '../../decorations/Decoration.js';
import { DecorationSet as DecorationSetClass } from '../../decorations/Decoration.js';
import { CODE_BLOCK_CSS } from '../../editor/styles/code-block.js';
import { LocaleServiceKey } from '../../i18n/LocaleService.js';
import type { BlockNode } from '../../model/Document.js';
import { getBlockText } from '../../model/Document.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import type { HTMLExportContext } from '../../model/NodeSpec.js';
import {
	createCollapsedSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { createBlockElement } from '../../view/DomUtils.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { formatShortcut } from '../shared/ShortcutFormatting.js';
import { registerCodeBlockCommands } from './CodeBlockCommands.js';
import { registerCodeBlockKeymaps } from './CodeBlockKeyboardHandlers.js';
import {
	CODE_BLOCK_LOCALE_EN,
	type CodeBlockLocale,
	loadCodeBlockLocale,
} from './CodeBlockLocale.js';
import { createCodeBlockNodeViewFactory } from './CodeBlockNodeView.js';
import { registerCodeBlockService } from './CodeBlockService.js';
import type { CodeBlockConfig, CodeBlockKeymap, SyntaxToken } from './CodeBlockTypes.js';
import { CODE_BLOCK_ICON, DEFAULT_CONFIG, DEFAULT_KEYMAP } from './CodeBlockTypes.js';

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

	async init(context: PluginContext): Promise<void> {
		if (this.config.locale) {
			this.locale = this.config.locale;
		} else {
			const service = context.getService(LocaleServiceKey);
			const lang: string = service?.getLocale() ?? 'en';
			this.locale = lang === 'en' ? CODE_BLOCK_LOCALE_EN : await loadCodeBlockLocale(lang);
		}
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

		const oldBlockId: BlockId | null =
			isNodeSelection(oldState.selection) || isGapCursor(oldState.selection)
				? null
				: oldState.selection.anchor.blockId;
		const newBlockId: BlockId | null =
			isNodeSelection(newState.selection) || isGapCursor(newState.selection)
				? null
				: newState.selection.anchor.blockId;

		const oldBlock: BlockNode | undefined = oldBlockId ? oldState.getBlock(oldBlockId) : undefined;
		const newBlock: BlockNode | undefined = newBlockId ? newState.getBlock(newBlockId) : undefined;

		const wasInCode: boolean = oldBlock?.type === 'code_block';
		const nowInCode: boolean = newBlock?.type === 'code_block';

		if (!wasInCode && nowInCode) {
			this.context.announce(this.locale.enteredCodeBlock);
		} else if (wasInCode && !nowInCode) {
			this.context.announce(this.locale.leftCodeBlock);
		}
	}

	decorations(state: EditorState): DecorationSet {
		const decorations: Decoration[] = [];

		const focusedBlockId: BlockId | null = this.getFocusedCodeBlockId(state);
		if (focusedBlockId) {
			decorations.push(nodeDecoration(focusedBlockId, { class: 'notectl-code-block--focused' }));
		}

		const highlighter = this.config.highlighter;
		if (highlighter) {
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
		}

		if (decorations.length === 0) return DecorationSetClass.empty;
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
				pre.setAttribute('dir', 'ltr');
				const code: HTMLElement = document.createElement('code');
				code.className = 'notectl-code-block__content';
				pre.appendChild(code);
				return pre;
			},
			toHTML(node, content, ctx?: HTMLExportContext) {
				const lang: string = escapeHTML((node.attrs?.language as string) ?? '');
				const bg: string = escapeHTML((node.attrs?.backgroundColor as string) ?? '');
				const langClass: string = lang ? ` class="language-${lang}"` : '';
				const bgAttr: string = bg
					? (ctx?.styleAttr(`background-color: ${bg}`) ?? ` style="background-color: ${bg}"`)
					: '';
				return `<pre dir="ltr"${bgAttr}><code${langClass}>${content || ''}</code></pre>`;
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
		context.registerNodeView(
			'code_block',
			createCodeBlockNodeViewFactory(this.config, this.locale),
		);
	}

	// --- Input Rule ---

	private registerInputRule(context: PluginContext): void {
		context.registerInputRule({
			pattern: /^```(\w*) $/,
			handler: (state, match, start, _end) => {
				const sel = state.selection;
				if (isNodeSelection(sel) || isGapCursor(sel)) return null;
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
			isActive: (state) => {
				if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return false;
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

	private getFocusedCodeBlockId(state: EditorState): BlockId | null {
		if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return null;
		const blockId: BlockId = state.selection.anchor.blockId;
		const block: BlockNode | undefined = state.getBlock(blockId);
		if (block?.type === 'code_block') return blockId;
		return null;
	}
}
