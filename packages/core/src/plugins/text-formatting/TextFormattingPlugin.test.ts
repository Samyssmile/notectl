import { describe, expect, it } from 'vitest';
import {
	expectCommandDispatches,
	expectCommandNotRegistered,
	expectCommandRegistered,
	expectKeyBinding,
	expectMarkSpec,
	expectNoKeyBinding,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { TextFormattingPlugin } from './TextFormattingPlugin.js';

describe('TextFormattingPlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new TextFormattingPlugin();
			expect(plugin.id).toBe('text-formatting');
			expect(plugin.name).toBe('Text Formatting');
		});

		it('has priority 20', () => {
			const plugin = new TextFormattingPlugin();
			expect(plugin.priority).toBe(20);
		});
	});

	describe('MarkSpec registration', () => {
		it('registers all three mark specs by default', async () => {
			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin);

			expect(h.getMarkSpec('bold')).toBeDefined();
			expect(h.getMarkSpec('italic')).toBeDefined();
			expect(h.getMarkSpec('underline')).toBeDefined();
		});

		it('bold MarkSpec creates <strong> element', async () => {
			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin);

			expectMarkSpec(h, 'bold', { tag: 'STRONG' });
		});

		it('italic MarkSpec creates <em> element', async () => {
			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin);

			expectMarkSpec(h, 'italic', { tag: 'EM' });
		});

		it('underline MarkSpec creates <u> element', async () => {
			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin);

			expectMarkSpec(h, 'underline', { tag: 'U' });
		});

		it('respects rank ordering (bold=0, italic=1, underline=2)', async () => {
			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin);

			expectMarkSpec(h, 'bold', { rank: 0 });
			expectMarkSpec(h, 'italic', { rank: 1 });
			expectMarkSpec(h, 'underline', { rank: 2 });
		});

		it('does not register disabled marks', async () => {
			const plugin = new TextFormattingPlugin({
				bold: true,
				italic: false,
				underline: false,
			});
			const h = await pluginHarness(plugin);

			expect(h.getMarkSpec('bold')).toBeDefined();
			expect(h.getMarkSpec('italic')).toBeUndefined();
			expect(h.getMarkSpec('underline')).toBeUndefined();
		});

		it('registers no marks when all disabled', async () => {
			const plugin = new TextFormattingPlugin({
				bold: false,
				italic: false,
				underline: false,
			});
			const h = await pluginHarness(plugin);

			expect(h.pm.schemaRegistry.getMarkTypes()).toEqual([]);
		});
	});

	describe('command registration', () => {
		it('registers toggleBold command', async () => {
			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin);

			expectCommandRegistered(h, 'toggleBold');
		});

		it('registers toggleItalic command', async () => {
			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin);

			expectCommandRegistered(h, 'toggleItalic');
		});

		it('registers toggleUnderline command', async () => {
			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin);

			expectCommandRegistered(h, 'toggleUnderline');
		});

		it('does not register commands for disabled marks', async () => {
			const plugin = new TextFormattingPlugin({
				bold: true,
				italic: false,
				underline: false,
			});
			const h = await pluginHarness(plugin);

			expectCommandRegistered(h, 'toggleBold');
			expectCommandNotRegistered(h, 'toggleItalic');
			expectCommandNotRegistered(h, 'toggleUnderline');
		});

		it('toggleBold command dispatches a transaction', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['bold', 'italic', 'underline'])
				.build();

			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin, state);

			expectCommandDispatches(h, 'toggleBold');
		});
	});

	describe('toolbar item registration', () => {
		it('registers toolbar items for all enabled marks', async () => {
			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin);

			const items = h.getToolbarItems();
			const ids = items.map((i) => i.id);
			expect(ids).toContain('bold');
			expect(ids).toContain('italic');
			expect(ids).toContain('underline');
		});

		it('toolbar items have correct labels', async () => {
			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin);

			expectToolbarItem(h, 'bold', {
				label: 'Bold',
				group: 'format',
				command: 'toggleBold',
				hasSvgIcon: true,
			});
		});

		it('toolbar items have correct priority ordering', async () => {
			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin);

			const items = h.getToolbarItems();
			const boldPriority = items.find((i) => i.id === 'bold')?.priority;
			const italicPriority = items.find((i) => i.id === 'italic')?.priority;
			const underlinePriority = items.find((i) => i.id === 'underline')?.priority;

			expect(boldPriority).toBeLessThan(italicPriority);
			expect(italicPriority).toBeLessThan(underlinePriority);
		});

		it('toolbar items report active state', async () => {
			const state = stateBuilder()
				.paragraph('bold', 'b1', { marks: [{ type: 'bold' }] })
				.cursor('b1', 2)
				.schema(['paragraph'], ['bold', 'italic', 'underline'])
				.build();

			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin, state);

			expectToolbarActive(h, 'bold', true);
			expectToolbarActive(h, 'italic', false);
		});

		it('does not register toolbar items for disabled marks', async () => {
			const plugin = new TextFormattingPlugin({
				bold: true,
				italic: false,
				underline: false,
			});
			const h = await pluginHarness(plugin);

			const items = h.getToolbarItems();
			const ids = items.map((i) => i.id);
			expect(ids).toContain('bold');
			expect(ids).not.toContain('italic');
			expect(ids).not.toContain('underline');
		});
	});

	describe('keymap registration', () => {
		it('registers keymaps for enabled marks', async () => {
			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin);

			const keymaps = h.getKeymaps();
			expect(keymaps.length).toBeGreaterThan(0);

			expectKeyBinding(h, 'Mod-B');
			expectKeyBinding(h, 'Mod-I');
			expectKeyBinding(h, 'Mod-U');
		});

		it('does not register keymaps for disabled marks', async () => {
			const plugin = new TextFormattingPlugin({
				bold: true,
				italic: false,
				underline: false,
			});
			const h = await pluginHarness(plugin);

			const keymaps = h.getKeymaps();
			expect(keymaps.length).toBeGreaterThan(0);

			expectKeyBinding(h, 'Mod-B');
			expectNoKeyBinding(h, 'Mod-I');
			expectNoKeyBinding(h, 'Mod-U');
		});

		it('does not register any keymap when all marks disabled', async () => {
			const plugin = new TextFormattingPlugin({
				bold: false,
				italic: false,
				underline: false,
			});
			const h = await pluginHarness(plugin);

			const keymaps = h.getKeymaps();
			expect(keymaps).toHaveLength(0);
		});
	});

	describe('config defaults', () => {
		it('enables all marks by default', async () => {
			const plugin = new TextFormattingPlugin();
			const h = await pluginHarness(plugin);

			expect(h.getMarkSpec('bold')).toBeDefined();
			expect(h.getMarkSpec('italic')).toBeDefined();
			expect(h.getMarkSpec('underline')).toBeDefined();
		});

		it('partial config merges with defaults', async () => {
			const plugin = new TextFormattingPlugin({ italic: false });
			const h = await pluginHarness(plugin);

			expect(h.getMarkSpec('bold')).toBeDefined();
			expect(h.getMarkSpec('italic')).toBeUndefined();
			expect(h.getMarkSpec('underline')).toBeDefined();
		});
	});
});
