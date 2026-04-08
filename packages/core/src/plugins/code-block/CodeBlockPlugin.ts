/**
 * CodeBlockPlugin: orchestrates code block registration by delegating to
 * focused modules for keyboard handling, commands, and service API.
 *
 * Inline responsibilities: NodeSpec, NodeView, InputRule, Toolbar,
 * Middleware, Decorations, and lifecycle hooks (focus tracking).
 */

import { addDeleteSelectionSteps } from '../../commands/Commands.js';
import type { Decoration, DecorationSet } from '../../decorations/Decoration.js';
import {
	inline as inlineDecoration,
	node as nodeDecoration,
} from '../../decorations/Decoration.js';
import { DecorationSet as DecorationSetClass } from '../../decorations/Decoration.js';
import { CODE_BLOCK_CSS } from '../../editor/styles/code-block.js';
import type { BlockNode } from '../../model/Document.js';
import { getBlockText } from '../../model/Document.js';
import { escapeHTML } from '../../model/HTMLUtils.js';
import type { HTMLExportContext } from '../../model/NodeSpec.js';
import { createCollapsedSelection, isCollapsed, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { createBlockElement } from '../../view/DomUtils.js';
import type { PasteInterceptor, Plugin, PluginContext } from '../Plugin.js';
import { LanguageRegistry } from '../language/LanguageRegistry.js';
import { LANGUAGE_REGISTRY_SERVICE_KEY } from '../language/LanguageTypes.js';
import { JAVA_SUPPORT, JSON_SUPPORT, XML_SUPPORT } from '../language/bundles/index.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import { PopupManager } from '../shared/PopupManager.js';
import { formatShortcut } from '../shared/ShortcutFormatting.js';
import { registerCodeBlockCommands } from './CodeBlockCommands.js';
import { registerCodeBlockKeymaps } from './CodeBlockKeyboardHandlers.js';
import {
	CODE_BLOCK_LOCALE_EN,
	type CodeBlockLocale,
	loadCodeBlockLocale,
} from './CodeBlockLocale.js';
import { type LanguagePickerDeps, createCodeBlockNodeViewFactory } from './CodeBlockNodeView.js';
import { registerCodeBlockService } from './CodeBlockService.js';
import type {
	CodeBlockConfig,
	CodeBlockKeymap,
	SyntaxHighlighter,
	SyntaxToken,
} from './CodeBlockTypes.js';
import {
	CODE_BLOCK_ICON,
	DEFAULT_CONFIG,
	DEFAULT_KEYMAP,
	SYNTAX_HIGHLIGHTER_SERVICE_KEY,
} from './CodeBlockTypes.js';
import { RegexTokenizer } from './highlighter/RegexTokenizer.js';

export class CodeBlockPlugin implements Plugin {
	readonly id = 'code-block';
	readonly name = 'Code Block';
	readonly priority = 36;

	private readonly config: CodeBlockConfig;
	private readonly resolvedKeymap: Readonly<Record<keyof CodeBlockKeymap, string | null>>;
	private context: PluginContext | null = null;
	private locale!: CodeBlockLocale;
	private highlighter: SyntaxHighlighter | null = null;
	private readonly languageRegistry = new LanguageRegistry();
	private readonly tokenCache = new Map<
		BlockId,
		{
			readonly text: string;
			readonly language: string;
			readonly tokens: readonly SyntaxToken[];
		}
	>();

	constructor(config?: Partial<CodeBlockConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.resolvedKeymap = {
			...DEFAULT_KEYMAP,
			...config?.keymap,
		};
	}

	async init(context: PluginContext): Promise<void> {
		this.locale = await resolveLocale(
			context,
			this.config.locale,
			CODE_BLOCK_LOCALE_EN,
			loadCodeBlockLocale,
		);
		context.registerStyleSheet(CODE_BLOCK_CSS);
		this.context = context;

		this.initHighlighter();
		this.registerLanguageRegistry(context);
		this.registerNodeSpec(context);
		this.registerNodeView(context);
		registerCodeBlockCommands(context, this.config);
		registerCodeBlockKeymaps(context, this.config, this.resolvedKeymap);
		this.registerInputRule(context);
		this.registerToolbarItem(context);
		this.registerMiddleware(context);
		registerCodeBlockService(
			context,
			() => this.highlighter,
			() => this.context,
		);
		this.registerSyntaxHighlighterService(context);
		this.registerPasteInterceptor(context);
		this.patchTableCellContent(context);
	}

	destroy(): void {
		this.context = null;
		this.highlighter = null;
		this.tokenCache.clear();
	}

	onStateChange(oldState: EditorState, newState: EditorState, _tr: Transaction): void {
		if (!this.context) return;

		const oldBlockId: BlockId | null = !isTextSelection(oldState.selection)
			? null
			: oldState.selection.anchor.blockId;
		const newBlockId: BlockId | null = !isTextSelection(newState.selection)
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

		if (this.highlighter) {
			const activeBlockIds = new Set<BlockId>();
			for (const bid of state.getBlockOrder()) {
				const block: BlockNode | undefined = state.getBlock(bid);
				if (!block || block.type !== 'code_block') continue;

				const lang: string = (block.attrs?.language as string) ?? '';
				if (!lang) continue;

				const text: string = getBlockText(block);
				if (!text) continue;

				activeBlockIds.add(bid);
				const tokens: readonly SyntaxToken[] = this.getCachedTokens(bid, text, lang);
				for (const token of tokens) {
					decorations.push(
						inlineDecoration(bid, token.from, token.to, {
							class: `notectl-token--${token.type}`,
						}),
					);
				}
			}

			// Purge stale cache entries
			for (const cachedId of this.tokenCache.keys()) {
				if (!activeBlockIds.has(cachedId)) {
					this.tokenCache.delete(cachedId);
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
		const popupManager: PopupManager = new PopupManager(context.getContainer());
		const highlighter = this.highlighter;
		const pickerDeps: LanguagePickerDeps = {
			popupManager,
			getSupportedLanguages: () => highlighter?.getSupportedLanguages() ?? [],
		};

		context.registerNodeView(
			'code_block',
			createCodeBlockNodeViewFactory(this.config, this.locale, pickerDeps),
		);
	}

	// --- Input Rule ---

	private registerInputRule(context: PluginContext): void {
		context.registerInputRule({
			pattern: /^```(\w*) $/,
			handler: (state, match, start, _end) => {
				const sel = state.selection;
				if (!isTextSelection(sel)) return null;
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
				if (!isTextSelection(state.selection)) return false;
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

	// --- Paste Interceptor ---

	private registerPasteInterceptor(context: PluginContext): void {
		context.registerPasteInterceptor(this.handleCodeBlockPaste, {
			name: 'code-block:paste',
			priority: 10,
		});
	}

	private readonly handleCodeBlockPaste: PasteInterceptor = (
		plainText: string,
		_html: string,
		state: EditorState,
	): Transaction | null => {
		if (!plainText) return null;
		if (!isTextSelection(state.selection)) return null;

		const block: BlockNode | undefined = state.getBlock(state.selection.anchor.blockId);
		if (!block || block.type !== 'code_block') return null;

		const builder = state.transaction('paste');

		let insertBlockId: BlockId = state.selection.anchor.blockId;
		let insertOffset: number = state.selection.anchor.offset;

		if (!isCollapsed(state.selection)) {
			const landingId: BlockId | undefined = addDeleteSelectionSteps(state, builder);
			if (landingId) {
				insertBlockId = landingId;
				insertOffset = 0;
			}
		}

		builder.insertText(insertBlockId, insertOffset, plainText, []);
		builder.setSelection(createCollapsedSelection(insertBlockId, insertOffset + plainText.length));

		return builder.build();
	};

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

	// --- Highlighter Setup ---

	private initHighlighter(): void {
		if (this.config.highlighter) {
			this.highlighter = this.config.highlighter;
		} else {
			this.highlighter = new RegexTokenizer();
		}
	}

	private registerLanguageRegistry(context: PluginContext): void {
		const highlighter: SyntaxHighlighter | null = this.highlighter;
		const cache: Map<
			BlockId,
			{ readonly text: string; readonly language: string; readonly tokens: readonly SyntaxToken[] }
		> = this.tokenCache;

		this.languageRegistry.onRegister((support) => {
			if (support.highlighting && highlighter?.registerLanguage) {
				highlighter.registerLanguage(support.highlighting);
				cache.clear();
			}
		});

		context.registerService(LANGUAGE_REGISTRY_SERVICE_KEY, this.languageRegistry);

		this.languageRegistry.register(JAVA_SUPPORT);
		this.languageRegistry.register(JSON_SUPPORT);
		this.languageRegistry.register(XML_SUPPORT);
	}

	private registerSyntaxHighlighterService(context: PluginContext): void {
		const tokenizer = this.highlighter;
		if (!tokenizer) return;

		context.registerService(SYNTAX_HIGHLIGHTER_SERVICE_KEY, {
			registerLanguage: (def) => {
				tokenizer.registerLanguage?.(def);
				this.tokenCache.clear();
			},
			getSupportedLanguages: () => tokenizer.getSupportedLanguages(),
			tokenize: (code, language) => tokenizer.tokenize(code, language),
		});
	}

	private getCachedTokens(
		blockId: BlockId,
		text: string,
		language: string,
	): readonly SyntaxToken[] {
		const cached = this.tokenCache.get(blockId);
		if (cached && cached.text === text && cached.language === language) {
			return cached.tokens;
		}
		const tokens: readonly SyntaxToken[] = this.highlighter?.tokenize(text, language) ?? [];
		this.tokenCache.set(blockId, { text, language, tokens });
		return tokens;
	}

	// --- Helpers ---

	private getFocusedCodeBlockId(state: EditorState): BlockId | null {
		if (!isTextSelection(state.selection)) return null;
		const blockId: BlockId = state.selection.anchor.blockId;
		const block: BlockNode | undefined = state.getBlock(blockId);
		if (block?.type === 'code_block') return blockId;
		return null;
	}
}
