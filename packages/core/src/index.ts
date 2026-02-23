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
export type { Keymap, KeymapHandler } from './input/Keymap.js';
export { normalizeKeyDescriptor } from './input/KeyboardHandler.js';
export { ClipboardHandler } from './input/ClipboardHandler.js';

// --- View ---
export type { NodeView, NodeViewFactory } from './view/NodeView.js';

// --- Plugins ---
export type {
	Plugin,
	PluginContext,
	CommandHandler,
	CommandEntry,
	PluginEventCallback,
	PluginEventBus,
	PluginConfig,
	TransactionMiddleware,
	MiddlewareNext,
} from './plugins/Plugin.js';

export { EventKey, ServiceKey } from './plugins/Plugin.js';

export { EventBus } from './plugins/EventBus.js';
export { PluginManager, type PluginManagerInitOptions } from './plugins/PluginManager.js';
export {
	ToolbarPlugin,
	ToolbarServiceKey,
	type ToolbarServiceAPI,
	type ToolbarLayoutConfig,
} from './plugins/toolbar/ToolbarPlugin.js';
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

// --- Editor ---
export type { NotectlEditorConfig, StateChangeEvent } from './editor/NotectlEditor.js';
export { NotectlEditor, createEditor } from './editor/NotectlEditor.js';
