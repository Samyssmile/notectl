/**
 * Full preset: a fully-featured editor with all standard plugins.
 */

import { AlignmentPlugin } from '../plugins/alignment/AlignmentPlugin.js';
import { BlockquotePlugin } from '../plugins/blockquote/BlockquotePlugin.js';
import { CodeBlockPlugin } from '../plugins/code-block/CodeBlockPlugin.js';
import { FontSizePlugin } from '../plugins/font-size/FontSizePlugin.js';
import { FontPlugin } from '../plugins/font/FontPlugin.js';
import { STARTER_FONTS } from '../plugins/font/StarterFonts.js';
import { HardBreakPlugin } from '../plugins/hard-break/HardBreakPlugin.js';
import { HeadingPlugin } from '../plugins/heading/HeadingPlugin.js';
import { HighlightPlugin } from '../plugins/highlight/HighlightPlugin.js';
import { HorizontalRulePlugin } from '../plugins/horizontal-rule/HorizontalRulePlugin.js';
import { ImagePlugin } from '../plugins/image/ImagePlugin.js';
import { LinkPlugin } from '../plugins/link/LinkPlugin.js';
import { ListPlugin } from '../plugins/list/ListPlugin.js';
import { PrintPlugin } from '../plugins/print/PrintPlugin.js';
import { StrikethroughPlugin } from '../plugins/strikethrough/StrikethroughPlugin.js';
import { SuperSubPlugin } from '../plugins/super-sub/SuperSubPlugin.js';
import { TablePlugin } from '../plugins/table/TablePlugin.js';
import { TextColorPlugin } from '../plugins/text-color/TextColorPlugin.js';
import { TextFormattingPlugin } from '../plugins/text-formatting/TextFormattingPlugin.js';
import type { FullPresetOptions, PresetConfig } from './PresetTypes.js';

/**
 * Creates a fully-featured editor preset with all standard plugins.
 *
 * Toolbar groups:
 * 1. Typography: Font, FontSize
 * 2. Inline marks: TextFormatting, Strikethrough, SuperSub
 * 3. Colors: TextColor, Highlight
 * 4. Block types: Heading, Blockquote, CodeBlock
 * 5. Paragraph layout: Alignment
 * 6. Lists: List
 * 7. Insert objects: Link, Table, HorizontalRule, Image
 * 8. Utility: Print
 */
export function createFullPreset(options?: FullPresetOptions): PresetConfig {
	return {
		toolbar: [
			[
				new FontPlugin({ fonts: STARTER_FONTS, ...options?.font }),
				new FontSizePlugin(options?.fontSize),
			],
			[
				new TextFormattingPlugin(options?.textFormatting),
				new StrikethroughPlugin(options?.strikethrough),
				new SuperSubPlugin(options?.superSub),
			],
			[new TextColorPlugin(options?.textColor), new HighlightPlugin(options?.highlight)],
			[
				new HeadingPlugin(options?.heading),
				new BlockquotePlugin(options?.blockquote),
				new CodeBlockPlugin(options?.codeBlock),
			],
			[new AlignmentPlugin(options?.alignment)],
			[new ListPlugin(options?.list)],
			[
				new LinkPlugin(options?.link),
				new TablePlugin(options?.table),
				new HorizontalRulePlugin(options?.horizontalRule),
				new ImagePlugin(options?.image),
			],
			[new PrintPlugin(options?.print)],
		],
		plugins: [new HardBreakPlugin()],
	};
}
