/**
 * Type definitions for the plugin preset system.
 */

import type { Plugin } from '../plugins/Plugin.js';
import type { AlignmentConfig } from '../plugins/alignment/AlignmentPlugin.js';
import type { BlockquoteConfig } from '../plugins/blockquote/BlockquotePlugin.js';
import type { CodeBlockConfig } from '../plugins/code-block/CodeBlockTypes.js';
import type { FontSizeConfig } from '../plugins/font-size/FontSizePlugin.js';
import type { FontConfig } from '../plugins/font/FontPlugin.js';
import type { HeadingConfig } from '../plugins/heading/HeadingPlugin.js';
import type { HighlightConfig } from '../plugins/highlight/HighlightPlugin.js';
import type { HorizontalRuleConfig } from '../plugins/horizontal-rule/HorizontalRulePlugin.js';
import type { ImagePluginConfig } from '../plugins/image/ImageUpload.js';
import type { LinkConfig } from '../plugins/link/LinkPlugin.js';
import type { ListConfig } from '../plugins/list/ListPlugin.js';
import type { PrintPluginConfig } from '../plugins/print/PrintTypes.js';
import type { StrikethroughConfig } from '../plugins/strikethrough/StrikethroughPlugin.js';
import type { SuperSubConfig } from '../plugins/super-sub/SuperSubPlugin.js';
import type { TextColorConfig } from '../plugins/text-color/TextColorPlugin.js';
import type { TextFormattingConfig } from '../plugins/text-formatting/TextFormattingPlugin.js';

/**
 * Return type of preset factory functions.
 * Spreads directly into `NotectlEditorConfig`.
 */
export interface PresetConfig {
	readonly toolbar: ReadonlyArray<ReadonlyArray<Plugin>>;
	readonly plugins: readonly Plugin[];
}

/** Configuration overrides for `createMinimalPreset()`. */
export interface MinimalPresetOptions {
	readonly font?: Partial<FontConfig>;
}

/** Configuration overrides for `createFullPreset()`. */
export interface FullPresetOptions {
	readonly font?: Partial<FontConfig>;
	readonly fontSize?: Partial<FontSizeConfig>;
	readonly textFormatting?: Partial<TextFormattingConfig>;
	readonly strikethrough?: Partial<StrikethroughConfig>;
	readonly superSub?: Partial<SuperSubConfig>;
	readonly textColor?: Partial<TextColorConfig>;
	readonly highlight?: Partial<HighlightConfig>;
	readonly heading?: Partial<HeadingConfig>;
	readonly blockquote?: Partial<BlockquoteConfig>;
	readonly codeBlock?: Partial<CodeBlockConfig>;
	readonly alignment?: Partial<AlignmentConfig>;
	readonly list?: Partial<ListConfig>;
	readonly link?: Partial<LinkConfig>;
	readonly table?: Partial<import('../plugins/table/TablePlugin.js').TableConfig>;
	readonly horizontalRule?: Partial<HorizontalRuleConfig>;
	readonly image?: Partial<ImagePluginConfig>;
	readonly print?: PrintPluginConfig;
}
