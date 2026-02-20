/**
 * @notectl/angular — Angular integration for the notectl rich text editor.
 * @packageDocumentation
 */

// --- Angular Bindings ---
export { NotectlEditorComponent } from './lib/notectl-editor.component';
export { NotectlValueAccessorDirective } from './lib/value-accessor.directive';
export { NotectlEditorService } from './lib/notectl-editor.service';

// --- Provider Function ---
export {
	provideNotectl,
	type NotectlProviderOptions,
} from './lib/tokens';

// --- Injection Tokens ---
export {
	NOTECTL_DEFAULT_CONFIG,
	NOTECTL_CONTENT_FORMAT,
	type ContentFormat,
} from './lib/tokens';

// --- Angular-specific Types ---
export type { SelectionChangeEvent } from './lib/types';

// --- Re-exports from @notectl/core (convenience) ---

// Model types
export type {
	Document,
	BlockNode,
	TextNode,
	InlineNode,
	Mark,
	BlockAttrs,
} from '@notectl/core';

// Selection types
export type { EditorSelection, Position, Selection } from '@notectl/core';

// State types
export type {
	EditorState,
	Transaction,
	TransactionMetadata,
	StateChangeEvent,
} from '@notectl/core';

// Plugin types
export type { Plugin, PluginConfig, PluginContext } from '@notectl/core';

// Theme types
export type { Theme, PartialTheme, ThemePrimitives } from '@notectl/core';
export { ThemePreset, LIGHT_THEME, DARK_THEME, createTheme } from '@notectl/core';

// Editor config
export type {
	NotectlEditorConfig,
	TextFormattingConfig,
} from '@notectl/core';

// Plugin config types
export type { FontDefinition } from '@notectl/core';

// Starter fonts
export { STARTER_FONTS } from '@notectl/core';

// Plugins (tree-shakable re-exports)
export {
	TextFormattingPlugin,
	HeadingPlugin,
	ListPlugin,
	LinkPlugin,
	BlockquotePlugin,
	CodeBlockPlugin,
	TablePlugin,
	ImagePlugin,
	HorizontalRulePlugin,
	HardBreakPlugin,
	StrikethroughPlugin,
	HighlightPlugin,
	TextColorPlugin,
	FontPlugin,
	FontSizePlugin,
	AlignmentPlugin,
	SuperSubPlugin,
	ToolbarPlugin,
} from '@notectl/core';
