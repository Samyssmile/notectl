/**
 * CodeBlockPlugin: orchestrates code-block registration by composing focused
 * collaborators — {@link TokenCache} (syntax-token caching), {@link AutoPairController}
 * (bracket/quote pairing), the highlighting setup, the decoration builder, and
 * the static schema/keyboard/command/service registrars.
 *
 * The plugin itself only wires these together and forwards the lifecycle hooks
 * (`decorations`, `onStateChange`, `destroy`).
 */

import type { DecorationSet } from '../../decorations/Decoration.js';
import { CODE_BLOCK_CSS } from '../../editor/styles/code-block.js';
import type { BlockNode } from '../../model/Document.js';
import { isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { Plugin, PluginContext } from '../Plugin.js';
import { resolveLocale } from '../shared/PluginHelpers.js';
import { PopupManager } from '../shared/PopupManager.js';
import { AutoPairController } from './AutoPairController.js';
import { registerCodeBlockCommands } from './CodeBlockCommands.js';
import { createCodeBlockDecorations } from './CodeBlockDecorations.js';
import { setupHighlighting } from './CodeBlockHighlighting.js';
import { registerCodeBlockKeymaps } from './CodeBlockKeyboardHandlers.js';
import {
	CODE_BLOCK_LOCALE_EN,
	type CodeBlockLocale,
	loadCodeBlockLocale,
} from './CodeBlockLocale.js';
import { type LanguagePickerDeps, createCodeBlockNodeViewFactory } from './CodeBlockNodeView.js';
import {
	patchTableCellContent,
	registerCodeBlockInputRule,
	registerCodeBlockMarkGuard,
	registerCodeBlockNodeSpec,
	registerCodeBlockPasteInterceptor,
	registerCodeBlockToolbarItem,
} from './CodeBlockSchema.js';
import { registerCodeBlockService } from './CodeBlockService.js';
import type {
	CodeBlockConfig,
	CodeBlockKeymap,
	ResolvedIndentConfig,
	ResolvedPairingConfig,
	SyntaxHighlighter,
} from './CodeBlockTypes.js';
import {
	DEFAULT_CONFIG,
	DEFAULT_INDENT,
	DEFAULT_KEYMAP,
	DEFAULT_PAIRING,
	MAX_SPACE_COUNT,
	MIN_SPACE_COUNT,
} from './CodeBlockTypes.js';
import { TokenCache } from './TokenCache.js';

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
	private readonly tokenCache = new TokenCache();
	private readonly autoPair: AutoPairController;

	constructor(config?: Partial<CodeBlockConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.resolvedIndent = resolveIndentConfig(this.config);
		this.resolvedPairing = resolvePairingConfig(this.config);
		this.resolvedKeymap = {
			...DEFAULT_KEYMAP,
			...config?.keymap,
		};
		this.autoPair = new AutoPairController({
			resolvedIndent: this.resolvedIndent,
			resolvedPairing: this.resolvedPairing,
			getTokenAt: (blockId, offset) => this.tokenCache.findTokenAt(blockId, offset),
			getCompositionState: () => this.context?.getCompositionState() ?? null,
		});
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

		this.highlighter = setupHighlighting(context, this.config, this.tokenCache);
		registerCodeBlockNodeSpec(context);
		this.registerNodeView(context);
		registerCodeBlockCommands(context, this.config);
		registerCodeBlockKeymaps(context, this.config, this.resolvedKeymap, {
			indent: this.resolvedIndent,
			pairing: this.resolvedPairing,
			pairStack: this.autoPair.pairStack,
			locale: () => this.locale,
		});
		if (this.config.inputRule !== false) registerCodeBlockInputRule(context);
		registerCodeBlockToolbarItem(context, this.locale, this.resolvedKeymap.toggle);
		registerCodeBlockMarkGuard(context);
		registerCodeBlockService(
			context,
			() => this.highlighter,
			() => this.context,
		);
		registerCodeBlockPasteInterceptor(context);
		context.registerTextInputInterceptor(this.autoPair.handleTextInput, {
			name: 'code-block:auto-pair',
			priority: 10,
		});
		patchTableCellContent(context);
	}

	destroy(): void {
		this.context = null;
		this.highlighter = null;
		this.tokenCache.clear();
		this.autoPair.clear();
	}

	onStateChange(oldState: EditorState, newState: EditorState, tr: Transaction): void {
		this.autoPair.syncOnStateChange(newState, tr);

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
		return createCodeBlockDecorations(state, {
			highlighter: this.highlighter,
			tokenCache: this.tokenCache,
		});
	}

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
