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
export type { NodeSpec, AttrSpec, ContentRule } from './model/NodeSpec.js';
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
	toggleMark,
	toggleBold,
	toggleItalic,
	toggleUnderline,
	insertTextCommand,
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
	TextAlignmentPlugin,
	type TextAlignmentConfig,
	type TextAlignment,
} from './plugins/text-alignment/TextAlignmentPlugin.js';

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
	FIRA_CODE,
	FIRA_SANS,
	STARTER_FONTS,
} from './plugins/font/StarterFonts.js';

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

export {
	IMAGE_UPLOAD_SERVICE,
	type ImagePluginConfig,
	type ImageUploadService,
	type ImageUploadResult,
	type ImageAttrs,
} from './plugins/image/ImageUpload.js';

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

// --- Editor ---
export type { NotectlEditorConfig, StateChangeEvent } from './editor/NotectlEditor.js';
export { NotectlEditor, createEditor } from './editor/NotectlEditor.js';
