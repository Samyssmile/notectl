import { describe, expect, it } from 'vitest';
import { AlignmentPlugin } from '../plugins/alignment/AlignmentPlugin.js';
import { BidiIsolationPlugin } from '../plugins/bidi-isolation/BidiIsolationPlugin.js';
import { BlockquotePlugin } from '../plugins/blockquote/BlockquotePlugin.js';
import { CodeBlockPlugin } from '../plugins/code-block/CodeBlockPlugin.js';
import { FontSizePlugin } from '../plugins/font-size/FontSizePlugin.js';
import { FontPlugin } from '../plugins/font/FontPlugin.js';
import { HardBreakPlugin } from '../plugins/hard-break/HardBreakPlugin.js';
import { HeadingPlugin } from '../plugins/heading/HeadingPlugin.js';
import { HighlightPlugin } from '../plugins/highlight/HighlightPlugin.js';
import { HorizontalRulePlugin } from '../plugins/horizontal-rule/HorizontalRulePlugin.js';
import { ImagePlugin } from '../plugins/image/ImagePlugin.js';
import { InlineCodePlugin } from '../plugins/inline-code/InlineCodePlugin.js';
import { LinkPlugin } from '../plugins/link/LinkPlugin.js';
import { ListPlugin } from '../plugins/list/ListPlugin.js';
import { PrintPlugin } from '../plugins/print/PrintPlugin.js';
import { StrikethroughPlugin } from '../plugins/strikethrough/StrikethroughPlugin.js';
import { SuperSubPlugin } from '../plugins/super-sub/SuperSubPlugin.js';
import { TablePlugin } from '../plugins/table/TablePlugin.js';
import { TextColorPlugin } from '../plugins/text-color/TextColorPlugin.js';
import { TextDirectionAutoPlugin } from '../plugins/text-direction-auto/TextDirectionAutoPlugin.js';
import { TextDirectionPlugin } from '../plugins/text-direction/TextDirectionPlugin.js';
import { TextFormattingPlugin } from '../plugins/text-formatting/TextFormattingPlugin.js';
import { createFullPreset } from './FullPreset.js';

describe('createFullPreset', () => {
	it('returns 8 toolbar groups', () => {
		const preset = createFullPreset();

		expect(preset.toolbar).toHaveLength(8);
	});

	it('group 1 contains Font and FontSize', () => {
		const preset = createFullPreset();
		const group = preset.toolbar[0];

		expect(group).toHaveLength(2);
		expect(group?.[0]).toBeInstanceOf(FontPlugin);
		expect(group?.[1]).toBeInstanceOf(FontSizePlugin);
	});

	it('group 2 contains TextFormatting, Strikethrough, InlineCode, SuperSub, BidiIsolation', () => {
		const preset = createFullPreset();
		const group = preset.toolbar[1];

		expect(group).toHaveLength(5);
		expect(group?.[0]).toBeInstanceOf(TextFormattingPlugin);
		expect(group?.[1]).toBeInstanceOf(StrikethroughPlugin);
		expect(group?.[2]).toBeInstanceOf(InlineCodePlugin);
		expect(group?.[3]).toBeInstanceOf(SuperSubPlugin);
		expect(group?.[4]).toBeInstanceOf(BidiIsolationPlugin);
	});

	it('group 3 contains TextColor and Highlight', () => {
		const preset = createFullPreset();
		const group = preset.toolbar[2];

		expect(group).toHaveLength(2);
		expect(group?.[0]).toBeInstanceOf(TextColorPlugin);
		expect(group?.[1]).toBeInstanceOf(HighlightPlugin);
	});

	it('group 4 contains Heading, Blockquote, CodeBlock', () => {
		const preset = createFullPreset();
		const group = preset.toolbar[3];

		expect(group).toHaveLength(3);
		expect(group?.[0]).toBeInstanceOf(HeadingPlugin);
		expect(group?.[1]).toBeInstanceOf(BlockquotePlugin);
		expect(group?.[2]).toBeInstanceOf(CodeBlockPlugin);
	});

	it('group 5 contains Alignment and TextDirection', () => {
		const preset = createFullPreset();
		const group = preset.toolbar[4];

		expect(group).toHaveLength(2);
		expect(group?.[0]).toBeInstanceOf(AlignmentPlugin);
		expect(group?.[1]).toBeInstanceOf(TextDirectionPlugin);
	});

	it('group 6 contains List', () => {
		const preset = createFullPreset();
		const group = preset.toolbar[5];

		expect(group).toHaveLength(1);
		expect(group?.[0]).toBeInstanceOf(ListPlugin);
	});

	it('group 7 contains Link, Table, HorizontalRule, Image', () => {
		const preset = createFullPreset();
		const group = preset.toolbar[6];

		expect(group).toHaveLength(4);
		expect(group?.[0]).toBeInstanceOf(LinkPlugin);
		expect(group?.[1]).toBeInstanceOf(TablePlugin);
		expect(group?.[2]).toBeInstanceOf(HorizontalRulePlugin);
		expect(group?.[3]).toBeInstanceOf(ImagePlugin);
	});

	it('group 8 contains Print', () => {
		const preset = createFullPreset();
		const group = preset.toolbar[7];

		expect(group).toHaveLength(1);
		expect(group?.[0]).toBeInstanceOf(PrintPlugin);
	});

	it('includes HardBreak, SmartPaste, and TextDirectionAuto in non-toolbar plugins', () => {
		const preset = createFullPreset();

		expect(preset.plugins).toHaveLength(3);
		expect(preset.plugins[0]).toBeInstanceOf(HardBreakPlugin);
		expect(preset.plugins[2]).toBeInstanceOf(TextDirectionAutoPlugin);
	});

	it('accepts per-plugin config overrides', () => {
		const preset = createFullPreset({
			list: { interactiveCheckboxes: true },
			heading: { levels: [1, 2, 3] },
		});

		expect(preset.toolbar).toHaveLength(8);
		expect(preset.toolbar[5]?.[0]).toBeInstanceOf(ListPlugin);
		expect(preset.toolbar[3]?.[0]).toBeInstanceOf(HeadingPlugin);
	});

	it('allows overriding font config with custom fonts', () => {
		const customFonts = [{ name: 'Custom', family: "'Custom', sans-serif" }];
		const preset = createFullPreset({ font: { fonts: customFonts } });

		expect(preset.toolbar[0]?.[0]).toBeInstanceOf(FontPlugin);
	});

	it('creates fresh instances per call', () => {
		const preset1 = createFullPreset();
		const preset2 = createFullPreset();

		// Each toolbar plugin should be a distinct instance
		for (let g = 0; g < preset1.toolbar.length; g++) {
			const group1 = preset1.toolbar[g];
			const group2 = preset2.toolbar[g];
			if (!group1 || !group2) continue;
			for (let p = 0; p < group1.length; p++) {
				expect(group1[p]).not.toBe(group2[p]);
			}
		}

		// Non-toolbar plugins should also be distinct
		expect(preset1.plugins[0]).not.toBe(preset2.plugins[0]);
	});
});
