/**
 * @notectl/core — State-first rich text editor Web Component.
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
	MarkType,
	NodeType,
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
	getBlockMarksAtOffset,
	getContentAtOffset,
	hasMark,
	markSetsEqual,
} from './model/Document.js';

// --- Selection ---
export type {
	Position,
	Selection,
	SelectionRange,
	NodeSelection,
	EditorSelection,
} from './model/Selection.js';
export {
	createPosition,
	createSelection,
	createCollapsedSelection,
	createNodeSelection,
	isCollapsed,
	isForward,
	selectionRange,
	isNodeSelection,
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

// --- NodeSpec & MarkSpec ---
export type { NodeSpec, AttrSpec, ContentRule, WrapperSpec } from './model/NodeSpec.js';
export { createBlockElement } from './model/NodeSpec.js';
export type { MarkSpec } from './model/MarkSpec.js';
export type { InlineNodeSpec } from './model/InlineNodeSpec.js';

// --- ParseRule & SanitizeConfig ---
export type { ParseRule } from './model/ParseRule.js';
export type { SanitizeConfig } from './model/SanitizeConfig.js';
export { escapeHTML } from './model/HTMLUtils.js';

// --- SchemaRegistry ---
export type { FileHandler, FileHandlerEntry } from './model/SchemaRegistry.js';
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
	isVoidBlock,
	deleteNodeSelection,
	navigateArrowIntoVoid,
} from './commands/Commands.js';

// --- Input ---
export type { InputRule } from './input/InputRule.js';
export type { Keymap, KeymapHandler, KeymapPriority, KeymapOptions } from './input/Keymap.js';
export { normalizeKeyDescriptor } from './input/KeyboardHandler.js';
export { ClipboardHandler } from './input/ClipboardHandler.js';
export { CompositionTracker } from './input/CompositionTracker.js';

// --- View ---
export type { NodeView, NodeViewFactory } from './view/NodeView.js';

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
export {
	ToolbarPlugin,
	ToolbarServiceKey,
	type ToolbarServiceAPI,
	type ToolbarLayoutConfig,
} from './plugins/toolbar/ToolbarPlugin.js';
export { ToolbarOverflowBehavior } from './plugins/toolbar/ToolbarOverflowBehavior.js';
export type { ToolbarOverflowBehavior as ToolbarOverflowBehaviorType } from './plugins/toolbar/ToolbarOverflowBehavior.js';
export type {
	ToolbarItem,
	ToolbarGroup,
	PopupType,
	GridPickerConfig,
	DropdownConfig,
} from './plugins/toolbar/ToolbarItem.js';
export { formatShortcut } from './plugins/toolbar/ToolbarItem.js';

export {
	TextFormattingPlugin,
	type TextFormattingConfig,
	type TextFormattingToolbarConfig,
} from './plugins/text-formatting/TextFormattingPlugin.js';

export {
	HeadingPlugin,
	type HeadingConfig,
	type HeadingLevel,
} from './plugins/heading/HeadingPlugin.js';

export type {
	BlockTypePickerEntry,
	PickerEntryStyle,
} from './plugins/heading/BlockTypePickerEntry.js';

export {
	LinkPlugin,
	type LinkConfig,
} from './plugins/link/LinkPlugin.js';

export {
	ListPlugin,
	type ListConfig,
	type ListType,
} from './plugins/list/ListPlugin.js';

export {
	BlockquotePlugin,
	type BlockquoteConfig,
} from './plugins/blockquote/BlockquotePlugin.js';

export {
	StrikethroughPlugin,
	type StrikethroughConfig,
} from './plugins/strikethrough/StrikethroughPlugin.js';

export {
	TextColorPlugin,
	type TextColorConfig,
} from './plugins/text-color/TextColorPlugin.js';

export {
	HorizontalRulePlugin,
	type HorizontalRuleConfig,
} from './plugins/horizontal-rule/HorizontalRulePlugin.js';

export {
	AlignmentPlugin,
	ALIGNMENT_ICONS,
	type AlignmentConfig,
	type BlockAlignment,
} from './plugins/alignment/AlignmentPlugin.js';

/** @deprecated Use `AlignmentPlugin` instead. */
export { AlignmentPlugin as TextAlignmentPlugin } from './plugins/alignment/AlignmentPlugin.js';
/** @deprecated Use `AlignmentConfig` instead. */
export type { AlignmentConfig as TextAlignmentConfig } from './plugins/alignment/AlignmentPlugin.js';
/** @deprecated Use `BlockAlignment` instead. */
export type { BlockAlignment as TextAlignment } from './plugins/alignment/AlignmentPlugin.js';

export {
	FontPlugin,
	type FontConfig,
	type FontDefinition,
	type FontFaceDescriptor,
} from './plugins/font/FontPlugin.js';

export {
	FontSizePlugin,
	type FontSizeConfig,
} from './plugins/font-size/FontSizePlugin.js';

export {
	TablePlugin,
	type TableConfig,
} from './plugins/table/TablePlugin.js';

export {
	TABLE_LOCALE_EN,
	TABLE_LOCALE_DE,
	TABLE_LOCALE_ES,
	TABLE_LOCALE_FR,
	TABLE_LOCALE_ZH,
	TABLE_LOCALE_RU,
	TABLE_LOCALE_AR,
	TABLE_LOCALE_HI,
	type TableLocale,
} from './plugins/table/TableLocale.js';

export {
	HighlightPlugin,
	type HighlightConfig,
} from './plugins/highlight/HighlightPlugin.js';

export {
	SuperSubPlugin,
	type SuperSubConfig,
	type SuperSubToolbarConfig,
} from './plugins/super-sub/SuperSubPlugin.js';

export {
	TableSelectionServiceKey,
	type TableSelectionService,
	type CellRange,
} from './plugins/table/TableSelection.js';

export {
	findTableContext,
	isInsideTable,
	type TableContext,
} from './plugins/table/TableHelpers.js';

export { ImagePlugin } from './plugins/image/ImagePlugin.js';

export { HardBreakPlugin } from './plugins/hard-break/HardBreakPlugin.js';

export {
	CodeBlockPlugin,
	CODE_BLOCK_SERVICE_KEY,
	type CodeBlockConfig,
	type CodeBlockKeymap,
	type CodeBlockService,
	type SyntaxHighlighter,
	type SyntaxToken,
} from './plugins/code-block/CodeBlockPlugin.js';

export {
	DEFAULT_IMAGE_KEYMAP,
	IMAGE_UPLOAD_SERVICE,
	type ImageAttrs,
	type ImageKeymap,
	type ImagePluginConfig,
	type ImageUploadResult,
	type ImageUploadService,
} from './plugins/image/ImageUpload.js';

export { PrintPlugin } from './plugins/print/PrintPlugin.js';
export {
	PRINT_SERVICE_KEY,
	BEFORE_PRINT,
	AFTER_PRINT,
	type PrintService,
	type PrintOptions,
	type PrintPluginConfig,
	type BeforePrintEvent,
	type AfterPrintEvent,
} from './plugins/print/PrintTypes.js';

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
export { resolvePluginLocale } from './i18n/resolvePluginLocale.js';

// --- Plugin Locales ---
export type { TextFormattingLocale } from './plugins/text-formatting/TextFormattingLocale.js';
export {
	TEXT_FORMATTING_LOCALE_EN,
	TEXT_FORMATTING_LOCALES,
} from './plugins/text-formatting/TextFormattingLocale.js';

export type { HeadingLocale } from './plugins/heading/HeadingLocale.js';
export { HEADING_LOCALE_EN, HEADING_LOCALES } from './plugins/heading/HeadingLocale.js';

export type { ListLocale } from './plugins/list/ListLocale.js';
export { LIST_LOCALE_EN, LIST_LOCALES } from './plugins/list/ListLocale.js';

export type { LinkLocale } from './plugins/link/LinkLocale.js';
export { LINK_LOCALE_EN, LINK_LOCALES } from './plugins/link/LinkLocale.js';

export type { BlockquoteLocale } from './plugins/blockquote/BlockquoteLocale.js';
export {
	BLOCKQUOTE_LOCALE_EN,
	BLOCKQUOTE_LOCALES,
} from './plugins/blockquote/BlockquoteLocale.js';

export type { StrikethroughLocale } from './plugins/strikethrough/StrikethroughLocale.js';
export {
	STRIKETHROUGH_LOCALE_EN,
	STRIKETHROUGH_LOCALES,
} from './plugins/strikethrough/StrikethroughLocale.js';

export type { SuperSubLocale } from './plugins/super-sub/SuperSubLocale.js';
export { SUPER_SUB_LOCALE_EN, SUPER_SUB_LOCALES } from './plugins/super-sub/SuperSubLocale.js';

export type { TextColorLocale } from './plugins/text-color/TextColorLocale.js';
export {
	TEXT_COLOR_LOCALE_EN,
	TEXT_COLOR_LOCALES,
} from './plugins/text-color/TextColorLocale.js';

export type { HighlightLocale } from './plugins/highlight/HighlightLocale.js';
export {
	HIGHLIGHT_LOCALE_EN,
	HIGHLIGHT_LOCALES,
} from './plugins/highlight/HighlightLocale.js';

export type { AlignmentLocale } from './plugins/alignment/AlignmentLocale.js';
export {
	ALIGNMENT_LOCALE_EN,
	ALIGNMENT_LOCALE_DE,
	ALIGNMENT_LOCALES,
} from './plugins/alignment/AlignmentLocale.js';

export type { FontLocale } from './plugins/font/FontLocale.js';
export { FONT_LOCALE_EN, FONT_LOCALES } from './plugins/font/FontLocale.js';

export type { FontSizeLocale } from './plugins/font-size/FontSizeLocale.js';
export {
	FONT_SIZE_LOCALE_EN,
	FONT_SIZE_LOCALES,
} from './plugins/font-size/FontSizeLocale.js';

export type { HorizontalRuleLocale } from './plugins/horizontal-rule/HorizontalRuleLocale.js';
export {
	HORIZONTAL_RULE_LOCALE_EN,
	HORIZONTAL_RULE_LOCALES,
} from './plugins/horizontal-rule/HorizontalRuleLocale.js';

export type { ImageLocale } from './plugins/image/ImageLocale.js';
export { IMAGE_LOCALE_EN, IMAGE_LOCALES } from './plugins/image/ImageLocale.js';

export type { CodeBlockLocale } from './plugins/code-block/CodeBlockLocale.js';
export {
	CODE_BLOCK_LOCALE_EN,
	CODE_BLOCK_LOCALES,
} from './plugins/code-block/CodeBlockLocale.js';

export type { PrintLocale } from './plugins/print/PrintLocale.js';
export { PRINT_LOCALE_EN, PRINT_LOCALES } from './plugins/print/PrintLocale.js';

export type { ToolbarLocale } from './plugins/toolbar/ToolbarLocale.js';
export { TOOLBAR_LOCALE_EN, TOOLBAR_LOCALES } from './plugins/toolbar/ToolbarLocale.js';

export { TABLE_LOCALES } from './plugins/table/TableLocale.js';

// --- Editor ---
export type {
	NotectlEditorConfig,
	ToolbarConfig,
	StateChangeEvent,
} from './editor/NotectlEditor.js';
export { NotectlEditor, createEditor } from './editor/NotectlEditor.js';
