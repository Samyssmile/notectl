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
import {
	createCollapsedSelection,
	createPosition,
	isCollapsed,
	isTextSelection,
	selectionRange,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import { createBlockElement } from '../../view/DomUtils.js';
import type { PasteInterceptor, Plugin, PluginContext, TextInputInterceptor } from '../Plugin.js';
import { LanguageRegistry } from '../language/LanguageRegistry.js';
import { LANGUAGE_REGISTRY_SERVICE_KEY } from '../language/LanguageTypes.js';
import {
	JAVA_SUPPORT,
	JSON_SUPPORT,
	TYPESCRIPT_SUPPORT,
	XML_SUPPORT,
} from '../language/bundles/index.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import { PopupManager } from '../shared/PopupManager.js';
import { formatShortcut } from '../shared/ShortcutFormatting.js';
import {
	type PairAction,
	type TokenLookup,
	resolvePairAction,
	wrapSelectionPlan,
} from './BracketPairing.js';
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
	ResolvedIndentConfig,
	ResolvedPairingConfig,
	SyntaxHighlighter,
	SyntaxToken,
} from './CodeBlockTypes.js';
import {
	CODE_BLOCK_ICON,
	DEFAULT_CONFIG,
	DEFAULT_INDENT,
	DEFAULT_KEYMAP,
	DEFAULT_PAIRING,
	MAX_SPACE_COUNT,
	MIN_SPACE_COUNT,
	SYNTAX_HIGHLIGHTER_SERVICE_KEY,
} from './CodeBlockTypes.js';
import { dedentOnce, getLineRange, isWhitespaceOnlyBeforeOffset } from './IndentHelpers.js';
import { PairStack } from './PairStack.js';
import { RegexTokenizer } from './highlighter/RegexTokenizer.js';

export class CodeBlockPlugin implements Plugin {
	readonly id = 'code-block';
	readonly name = 'Code Block';
	readonly priority = 36;

	private readonly config: CodeBlockConfig;
	private readonly resolvedIndent: ResolvedIndentConfig;
	private readonly resolvedPairing: ResolvedPairingConfig;
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
	private readonly pairStack = new PairStack();
	private readonly pendingPairOps: Array<
		| {
				readonly kind: 'push';
				readonly blockId: BlockId;
				readonly offset: number;
				readonly char: string;
		  }
		| { readonly kind: 'take'; readonly blockId: BlockId; readonly offset: number }
	> = [];

	constructor(config?: Partial<CodeBlockConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.resolvedIndent = resolveIndentConfig(this.config);
		this.resolvedPairing = resolvePairingConfig(this.config);
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
		registerCodeBlockKeymaps(context, this.config, this.resolvedKeymap, {
			indent: this.resolvedIndent,
			pairing: this.resolvedPairing,
			pairStack: this.pairStack,
			locale: () => this.locale,
		});
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
		this.registerTextInputInterceptor(context);
		this.patchTableCellContent(context);
	}

	destroy(): void {
		this.context = null;
		this.highlighter = null;
		this.tokenCache.clear();
		this.pairStack.clear();
	}

	onStateChange(oldState: EditorState, newState: EditorState, tr: Transaction): void {
		this.migratePairStack(newState, tr);

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

	private migratePairStack(state: EditorState, tr: Transaction): void {
		if (this.pairStack.size > 0 && !tr.mapping.isEmpty) {
			this.pairStack.migrate(tr.mapping);
		}

		// Apply any pending push/take operations recorded by the interceptor.
		// Positions in `pendingPairOps` are already expressed in *post-transaction*
		// space, so they must be applied AFTER the migration above (otherwise the
		// migration would shift them again).
		for (const op of this.pendingPairOps) {
			if (op.kind === 'push') {
				this.pairStack.push(createPosition(op.blockId, op.offset), op.char);
			} else {
				this.pairStack.take(op.blockId, op.offset);
			}
		}
		this.pendingPairOps.length = 0;

		// Clear entries whose host block is no longer a code block.
		for (const step of tr.steps) {
			if (step.type !== 'setBlockType') continue;
			const block: BlockNode | undefined = state.getBlock(step.blockId);
			if (!block || block.type !== 'code_block') {
				this.pairStack.clearBlock(step.blockId);
			}
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

	private registerTextInputInterceptor(context: PluginContext): void {
		context.registerTextInputInterceptor(this.handleCodeBlockTextInput, {
			name: 'code-block:auto-pair',
			priority: 10,
		});
	}

	private readonly handleCodeBlockTextInput: TextInputInterceptor = (
		text: string,
		state: EditorState,
	): Transaction | null => {
		// Drop any pending pair ops left over from a previously suppressed
		// transaction. `onStateChange` only fires when a tr reaches `state.apply`;
		// if middleware blocked the last tr, its queued ops would otherwise leak
		// into the next successful cycle with stale offsets.
		this.pendingPairOps.length = 0;

		if (!this.context) return null;
		if (this.context.getCompositionState().isComposing) return null;
		if (!isTextSelection(state.selection)) return null;
		// Only single-char inputs trigger pair logic.
		if (text.length !== 1) return null;

		const sel = state.selection;
		const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
		if (!block || block.type !== 'code_block') return null;

		// Dedent-on-close-bracket: typing `}`, `]`, `)` on a whitespace-only line
		// reduces leading indent by one step before inserting the char.
		const dedentTr: Transaction | null = this.tryDedentOnCloseBracket(state, block, text);
		if (dedentTr) return dedentTr;

		const action: PairAction = resolvePairAction({
			state,
			block,
			blockId: sel.anchor.blockId,
			char: text,
			config: this.resolvedPairing,
			pairStack: this.pairStack,
			getTokenAt: this.tokenLookup,
		});

		switch (action.kind) {
			case 'pair':
				return this.buildAutoPairTransaction(state, sel.anchor.blockId, action.close, text);
			case 'overtype':
				return this.buildOvertypeTransaction(state, sel.anchor.blockId);
			case 'wrap':
				return this.buildWrapTransaction(state, sel.anchor.blockId, action.open, action.close);
			case 'passthrough':
				return null;
		}
	};

	private readonly tokenLookup: TokenLookup = (blockId, offset) =>
		this.findTokenAt(blockId, offset);

	private tryDedentOnCloseBracket(
		state: EditorState,
		block: BlockNode,
		char: string,
	): Transaction | null {
		if (this.resolvedIndent.mode !== 'brackets') return null;
		if (char !== '}' && char !== ']' && char !== ')') return null;

		const sel = state.selection;
		if (!isTextSelection(sel) || !isCollapsed(sel)) return null;

		const text: string = getBlockText(block);
		const offset: number = sel.anchor.offset;
		if (!isWhitespaceOnlyBeforeOffset(text, offset)) return null;

		const { start } = getLineRange(text, offset);
		if (start === offset) return null; // no leading indent on this line

		const blockId: BlockId = sel.anchor.blockId;

		// Combined dedent + overtype: when the next non-whitespace char ahead of
		// the cursor (across any newlines) is a tracked auto-paired close of the
		// same kind, collapse the gap so the user's typed close consumes the
		// auto-paired one instead of producing a duplicate.
		const trackedClosePos: number | null = this.findTrackedCloseAfter(text, offset, char, blockId);
		if (trackedClosePos !== null) {
			return state
				.transaction('input')
				.deleteTextAt(blockId, start, trackedClosePos)
				.setSelection(createCollapsedSelection(blockId, start + 1))
				.build();
		}

		const lineSlice: string = text.slice(start, offset);
		const result = dedentOnce(
			lineSlice,
			this.resolvedIndent.useSpaces,
			this.resolvedIndent.spaceCount,
		);
		if (result.removed.length === 0) return null;

		const newOffset: number = offset - result.removed.length;
		return state
			.transaction('input')
			.deleteTextAt(blockId, newOffset, offset)
			.insertText(blockId, newOffset, char, [])
			.setSelection(createCollapsedSelection(blockId, newOffset + 1))
			.build();
	}

	/**
	 * Scans forward from `offset` through whitespace and newlines for a tracked
	 * auto-paired close char matching `char`. Returns its position or `null` if
	 * any other char (or end-of-text) is encountered first.
	 */
	private findTrackedCloseAfter(
		text: string,
		offset: number,
		char: string,
		blockId: BlockId,
	): number | null {
		for (let i = offset; i < text.length; i++) {
			const ch: string | undefined = text[i];
			if (ch === ' ' || ch === '\t' || ch === '\n') continue;
			if (ch === char) {
				const entry = this.pairStack.peek(blockId, i);
				if (entry && entry.char === char) return i;
			}
			return null;
		}
		return null;
	}

	private buildAutoPairTransaction(
		state: EditorState,
		blockId: BlockId,
		closeChar: string,
		openChar: string,
	): Transaction {
		const sel = state.selection;
		if (!isTextSelection(sel)) {
			throw new Error('buildAutoPairTransaction requires a text selection');
		}
		const offset: number = sel.anchor.offset;
		const inserted = `${openChar}${closeChar}`;
		const tr: Transaction = state
			.transaction('input')
			.insertText(blockId, offset, inserted, [])
			.setSelection(createCollapsedSelection(blockId, offset + 1))
			.build();
		// Record the auto-inserted close char so overtype/pair-delete can target it.
		// The position is expressed in post-transaction space; the actual push
		// happens in `onStateChange` after the mapping migration runs.
		this.pendingPairOps.push({
			kind: 'push',
			blockId,
			offset: offset + 1,
			char: closeChar,
		});
		return tr;
	}

	private buildOvertypeTransaction(state: EditorState, blockId: BlockId): Transaction {
		const sel = state.selection;
		if (!isTextSelection(sel)) {
			throw new Error('buildOvertypeTransaction requires a text selection');
		}
		const offset: number = sel.anchor.offset;
		// Schedule the take so it survives the migration phase (the entry's
		// position is in pre-transaction space, so migration will preserve it).
		this.pendingPairOps.push({ kind: 'take', blockId, offset });
		return state
			.transaction('input')
			.setSelection(createCollapsedSelection(blockId, offset + 1))
			.build();
	}

	private buildWrapTransaction(
		state: EditorState,
		blockId: BlockId,
		openChar: string,
		closeChar: string,
	): Transaction {
		const sel = state.selection;
		if (!isTextSelection(sel)) {
			throw new Error('buildWrapTransaction requires a text selection');
		}
		const plan = wrapSelectionPlan(sel, state.getBlockOrder());
		const range = selectionRange(sel, state.getBlockOrder());
		const wasForward: boolean = range.from === sel.anchor;
		const newFrom: number = plan.fromOffset + 1;
		const newTo: number = plan.toOffset + 1;
		const anchorOff: number = wasForward ? newFrom : newTo;
		const headOff: number = wasForward ? newTo : newFrom;

		return state
			.transaction('input')
			.insertText(blockId, plan.toOffset, closeChar, [])
			.insertText(blockId, plan.fromOffset, openChar, [])
			.setSelection({
				anchor: { blockId, offset: anchorOff },
				head: { blockId, offset: headOff },
			})
			.build();
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
		this.languageRegistry.register(TYPESCRIPT_SUPPORT);
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
			getTokenAt: (blockId, offset) => this.findTokenAt(blockId, offset),
		});
	}

	/**
	 * Binary-search the cached token list for the token whose range covers
	 * `offset`. Returns `undefined` on cache miss or if the offset lies in a
	 * gap between tokens.
	 */
	private findTokenAt(blockId: BlockId, offset: number): SyntaxToken | undefined {
		const cached = this.tokenCache.get(blockId);
		if (!cached) return undefined;
		const tokens = cached.tokens;
		let low = 0;
		let high = tokens.length - 1;
		while (low <= high) {
			const mid: number = (low + high) >>> 1;
			const token: SyntaxToken | undefined = tokens[mid];
			if (!token) return undefined;
			if (offset < token.from) {
				high = mid - 1;
			} else if (offset >= token.to) {
				low = mid + 1;
			} else {
				return token;
			}
		}
		return undefined;
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

/**
 * Merges `indent.*` overrides with deprecated top-level `useSpaces`/`spaceCount`
 * fallbacks, and clamps `spaceCount` once into [MIN_SPACE_COUNT, MAX_SPACE_COUNT].
 */
function resolveIndentConfig(config: CodeBlockConfig): ResolvedIndentConfig {
	const useSpaces: boolean =
		config.indent?.useSpaces ?? config.useSpaces ?? DEFAULT_INDENT.useSpaces;
	const rawSpaceCount: number =
		config.indent?.spaceCount ?? config.spaceCount ?? DEFAULT_INDENT.spaceCount;
	const spaceCount: number = Math.max(
		MIN_SPACE_COUNT,
		Math.min(MAX_SPACE_COUNT, Math.trunc(rawSpaceCount)),
	);
	const mode: 'none' | 'keep' | 'brackets' = config.indent?.mode ?? DEFAULT_INDENT.mode;
	return { mode, useSpaces, spaceCount };
}

function resolvePairingConfig(config: CodeBlockConfig): ResolvedPairingConfig {
	const p = config.pairing;
	return {
		brackets: p?.brackets ?? DEFAULT_PAIRING.brackets,
		quotes: p?.quotes ?? DEFAULT_PAIRING.quotes,
		overtype: p?.overtype ?? DEFAULT_PAIRING.overtype,
		deletePair: p?.deletePair ?? DEFAULT_PAIRING.deletePair,
		surround: p?.surround ?? DEFAULT_PAIRING.surround,
	};
}
