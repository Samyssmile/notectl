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
export type { NotectlValue, SelectionChangeEvent } from './lib/types';

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
export type { NotectlEditorConfig } from '@notectl/core';

// Plugin config types (from sub-path exports)
export type { TextFormattingConfig } from '@notectl/core/plugins/text-formatting';
export type { FontDefinition } from '@notectl/core/plugins/font';

// Starter fonts
/** @deprecated Import from '@notectl/core/fonts' instead. */
export { STARTER_FONTS } from '@notectl/core/fonts';

// Plugins (tree-shakable re-exports from sub-paths)
export { TextFormattingPlugin } from '@notectl/core/plugins/text-formatting';
export { HeadingPlugin } from '@notectl/core/plugins/heading';
export { ListPlugin } from '@notectl/core/plugins/list';
export { LinkPlugin } from '@notectl/core/plugins/link';
export { BlockquotePlugin } from '@notectl/core/plugins/blockquote';
export { CodeBlockPlugin } from '@notectl/core/plugins/code-block';
export { TablePlugin } from '@notectl/core/plugins/table';
export { ImagePlugin } from '@notectl/core/plugins/image';
export { HorizontalRulePlugin } from '@notectl/core/plugins/horizontal-rule';
export { HardBreakPlugin } from '@notectl/core/plugins/hard-break';
export { StrikethroughPlugin } from '@notectl/core/plugins/strikethrough';
export { HighlightPlugin } from '@notectl/core/plugins/highlight';
export { TextColorPlugin } from '@notectl/core/plugins/text-color';
export { FontPlugin } from '@notectl/core/plugins/font';
export { FontSizePlugin } from '@notectl/core/plugins/font-size';
export { AlignmentPlugin } from '@notectl/core/plugins/alignment';
export { TextDirectionPlugin } from '@notectl/core/plugins/text-direction';
export { BidiIsolationPlugin } from '@notectl/core/plugins/bidi-isolation';
export { TextDirectionAutoPlugin } from '@notectl/core/plugins/text-direction-auto';
export { SuperSubPlugin } from '@notectl/core/plugins/super-sub';
export { ToolbarPlugin } from '@notectl/core/plugins/toolbar';
