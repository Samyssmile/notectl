/**
 * @notectl/core — State-first rich text editor Web Component.
 *
 * This entry point exports the core framework: model, state, view, input,
 * commands, plugin system, decorations, theme, and the editor Web Component.
 *
 * For plugins, presets, HTML serialization, and fonts, use sub-path imports:
 * - `@notectl/core/plugins/<name>` — individual plugins
 * - `@notectl/core/presets` — preset factory functions
 * - `@notectl/core/html` — HTML serialization/parsing
 * - `@notectl/core/fonts` — starter font definitions
 * - `@notectl/core/full` — kitchen-sink (all of the above)
 *
 * @packageDocumentation
 */

// --- Model ---
export type {
	Document,
	BlockNode,
	TextNode,
	InlineNode,
	TextSegment,
	ContentSegment,
	ChildNode,
	Mark,
	BoldMark,
	ItalicMark,
	UnderlineMark,
	BlockAttrs,
} from './model/Document.js';

export {
	createDocument,
	createBlockNode,
	createTextNode,
	createInlineNode,
	isTextNode,
	isInlineNode,
	isBlockNode,
	isLeafBlock,
	getTextChildren,
	getInlineChildren,
	getBlockChildren,
	getBlockText,
	getBlockLength,
	blockOffsetToTextOffset,
	getBlockMarksAtOffset,
	getContentAtOffset,
	hasMark,
	markSetsEqual,
} from './model/Document.js';

// --- Grapheme Utils ---
export { nextGraphemeSize, prevGraphemeSize } from './model/GraphemeUtils.js';

// --- Selection ---
export type {
	Position,
	Selection,
	SelectionRange,
	NodeSelection,
	GapCursorSelection,
	EditorSelection,
} from './model/Selection.js';
export {
	createPosition,
	createSelection,
	createCollapsedSelection,
	createNodeSelection,
	createGapCursor,
	isCollapsed,
	isForward,
	selectionRange,
	isNodeSelection,
	isGapCursor,
	isTextSelection,
	selectionsEqual,
} from './model/Selection.js';

// --- Schema ---
export type { Schema } from './model/Schema.js';
export { defaultSchema, schemaFromRegistry, isMarkAllowed } from './model/Schema.js';

// --- Branded Types ---
export type {
	BlockId,
	NodeTypeName,
	MarkTypeName,
	InlineTypeName,
	PluginId,
	CommandName,
} from './model/TypeBrands.js';
export {
	blockId,
	nodeType,
	markType,
	inlineType,
	pluginId,
	commandName,
} from './model/TypeBrands.js';

// --- Attribute Registry ---
export type {
	NodeAttrRegistry,
	MarkAttrRegistry,
	InlineNodeAttrRegistry,
	NodeAttrsFor,
	MarkAttrsFor,
	InlineNodeAttrsFor,
} from './model/AttrRegistry.js';
export { isNodeOfType, isMarkOfType, isInlineNodeOfType } from './model/AttrRegistry.js';
export type { BlockAlignment } from './model/BlockAlignment.js';

// --- NodeSpec & MarkSpec ---
export type {
	NodeSpec,
	AttrSpec,
	ContentRule,
	WrapperSpec,
	HTMLExportContext,
} from './model/NodeSpec.js';
export { createBlockElement } from './model/NodeSpec.js';
export type { MarkSpec } from './model/MarkSpec.js';
export type { InlineNodeSpec } from './model/InlineNodeSpec.js';

// --- ParseRule & SanitizeConfig ---
export type { ParseRule } from './model/ParseRule.js';
export type { SanitizeConfig } from './model/SanitizeConfig.js';
export { escapeHTML, formatHTML } from './model/HTMLUtils.js';

// --- SchemaRegistry ---
export { SchemaRegistry } from './model/SchemaRegistry.js';

// --- NodeResolver ---
export {
	resolveNodeByPath,
	resolveParentByPath,
	findNodePath,
	findNode,
	findNodeWithPath,
	walkNodes,
} from './model/NodeResolver.js';

// --- ContentModel ---
export { canContain, validateContent } from './model/ContentModel.js';

// --- BuiltinSpecs ---
export { registerBuiltinSpecs } from './model/BuiltinSpecs.js';

// --- State ---
export { EditorState } from './state/EditorState.js';

export type {
	Transaction,
	TransactionMetadata,
	TransactionOrigin,
	Step,
	InsertTextStep,
	DeleteTextStep,
	SplitBlockStep,
	MergeBlocksStep,
	AddMarkStep,
	RemoveMarkStep,
	SetBlockTypeStep,
	InsertNodeStep,
	RemoveNodeStep,
	SetNodeAttrStep,
	InsertInlineNodeStep,
	RemoveInlineNodeStep,
	SetInlineNodeAttrStep,
} from './state/Transaction.js';

export { TransactionBuilder, invertStep, invertTransaction } from './state/Transaction.js';

export { applyStep } from './state/StepApplication.js';

export { isAllowedInReadonly, isSelectionOnlyTransaction } from './state/ReadonlyGuard.js';

export { HistoryManager } from './state/History.js';
export type { HistoryResult } from './state/History.js';

export { extendTx, moveTx, nodeSelTx } from './state/SelectionTransactions.js';

// --- Commands ---
export type { FeatureConfig } from './commands/Commands.js';
export {
	forEachBlockInRange,
	toggleMark,
	toggleBold,
	toggleItalic,
	toggleUnderline,
	insertTextCommand,
	insertHardBreakCommand,
	deleteSelectionCommand,
	deleteBackward,
	deleteForward,
	splitBlockCommand,
	mergeBlockBackward,
	selectAll,
	isMarkActive,
	sharesParent,
	isInsideIsolating,
	isIsolatingBlock,
	isVoidBlock,
	deleteNodeSelection,
	deleteBackwardAtGap,
	deleteForwardAtGap,
	navigateArrowIntoVoid,
	findWordBoundaryForward,
	findWordBoundaryBackward,
	canCrossBlockBoundary,
	applyAttributedMark,
	removeAttributedMark,
	getMarkAttrAtSelection,
	isAttributedMarkActive,
} from './commands/Commands.js';

// --- Movement Commands ---
export {
	moveCharacterForward,
	moveCharacterBackward,
	moveToBlockStart,
	moveToBlockEnd,
	moveToDocumentStart,
	moveToDocumentEnd,
	extendCharacterForward,
	extendCharacterBackward,
	extendToBlockStart,
	extendToBlockEnd,
	extendToDocumentStart,
	extendToDocumentEnd,
} from './commands/MovementCommands.js';

// --- View Movement Commands ---
export {
	viewMove,
	viewExtend,
	moveWordForward,
	moveWordBackward,
	moveToLineStart,
	moveToLineEnd,
	moveLineUp,
	moveLineDown,
	extendWordForward,
	extendWordBackward,
	extendToLineStart,
	extendToLineEnd,
	extendLineUp,
	extendLineDown,
} from './view/ViewMovementCommands.js';

// --- Input ---
export type { InputRule } from './input/InputRule.js';
export type { Keymap, KeymapHandler, KeymapPriority, KeymapOptions } from './input/Keymap.js';
export { normalizeKeyDescriptor } from './input/KeyboardHandler.js';
export { ClipboardHandler } from './input/ClipboardHandler.js';
export { CompositionTracker } from './input/CompositionTracker.js';

// --- Focused Registries ---
export { KeymapRegistry } from './input/KeymapRegistry.js';
export { InputRuleRegistry } from './input/InputRuleRegistry.js';
export type { FileHandler, FileHandlerEntry } from './input/FileHandlerRegistry.js';
export { FileHandlerRegistry } from './input/FileHandlerRegistry.js';
export { NodeViewRegistry } from './view/NodeViewRegistry.js';

// --- View ---
export type { NodeView, NodeViewFactory } from './view/NodeView.js';

// --- CursorWrapper ---
export { CursorWrapper } from './view/CursorWrapper.js';

// --- Platform ---
export { isMac, isFirefox, isWebKit, getTextDirection, isRtlContext } from './view/Platform.js';

// --- Caret Navigation ---
export {
	endOfTextblock,
	navigateAcrossBlocks,
	navigateVerticalWithGoalColumn,
	navigateFromGapCursor,
	skipInlineNode,
	getCaretRectFromSelection,
} from './view/CaretNavigation.js';
export type { CaretDirection } from './view/CaretNavigation.js';

// --- Plugins ---
export type {
	Plugin,
	PluginContext,
	CommandHandler,
	CommandEntry,
	CommandOptions,
	PluginEventCallback,
	PluginEventBus,
	PluginConfig,
	TransactionMiddleware,
	MiddlewareNext,
	MiddlewareOptions,
} from './plugins/Plugin.js';

export { EventKey, ServiceKey } from './plugins/Plugin.js';

export { EventBus } from './plugins/EventBus.js';
export {
	PluginManager,
	type PluginManagerInitOptions,
	type MiddlewareInfo,
} from './plugins/PluginManager.js';

// --- Decorations ---
export type {
	Decoration,
	InlineDecoration,
	NodeDecoration,
	WidgetDecoration,
	DecorationAttrs,
} from './decorations/Decoration.js';
export {
	DecorationSet,
	inline as inlineDecoration,
	node as nodeDecoration,
	widget as widgetDecoration,
} from './decorations/Decoration.js';

// --- Theme ---
export {
	ThemePreset,
	LIGHT_THEME,
	DARK_THEME,
	createTheme,
	resolveTheme,
} from './editor/theme/ThemeTokens.js';
export type {
	Theme,
	PartialTheme,
	ThemePrimitives,
	ThemeToolbar,
	ThemeCodeBlock,
	ThemeTooltip,
} from './editor/theme/ThemeTokens.js';
export { generateThemeCSS, createThemeStyleSheet } from './editor/theme/ThemeEngine.js';

// --- Paper Size ---
export {
	PaperSize,
	getPaperDimensions,
	getPaperCSSSize,
	isValidPaperSize,
	PAPER_MARGIN_TOP_PX,
	PAPER_MARGIN_HORIZONTAL_PX,
	PAPER_VIEWPORT_PADDING_PX,
} from './editor/PaperSize.js';
export type { PaperDimensions } from './editor/PaperSize.js';

// --- i18n ---
export { Locale } from './i18n/Locale.js';
export type { Locale as LocaleType } from './i18n/Locale.js';
export { LocaleService, LocaleServiceKey } from './i18n/LocaleService.js';

// --- Announcer ---
export { getBlockTypeLabel } from './editor/Announcer.js';

// --- CSS Delivery Utilities ---
export {
	adoptContentStyles,
	injectContentStyles,
	removeAdoptedStyles,
	removeContentStyles,
} from './editor/ContentStyleInjector.js';
export type { AdoptStylesOptions, InjectStylesOptions } from './editor/ContentStyleInjector.js';

// --- Editor ---
export type {
	NotectlEditorConfig,
	ToolbarConfig,
	StateChangeEvent,
} from './editor/NotectlEditor.js';
export { NotectlEditor, createEditor } from './editor/NotectlEditor.js';
