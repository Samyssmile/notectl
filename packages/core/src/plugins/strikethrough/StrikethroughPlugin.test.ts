import { describe, expect, it } from 'vitest';
import {
	expectCommandDispatches,
	expectCommandRegistered,
	expectKeyBinding,
	expectMarkSpec,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { StrikethroughPlugin } from './StrikethroughPlugin.js';

// --- Tests ---

describe('StrikethroughPlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new StrikethroughPlugin();
			expect(plugin.id).toBe('strikethrough');
			expect(plugin.name).toBe('Strikethrough');
			expect(plugin.priority).toBe(22);
		});
	});

	describe('MarkSpec', () => {
		it('registers strikethrough MarkSpec with correct tag and rank', async () => {
			const h = await pluginHarness(new StrikethroughPlugin());
			expectMarkSpec(h, 'strikethrough', { tag: 'S', rank: 3 });
		});
	});

	describe('command', () => {
		it('registers toggleStrikethrough command', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.schema(['paragraph'], ['strikethrough'])
				.build();
			const h = await pluginHarness(new StrikethroughPlugin(), state);
			expectCommandRegistered(h, 'toggleStrikethrough');
		});

		it('toggleStrikethrough dispatches a transaction on range selection', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['strikethrough'])
				.build();

			const h = await pluginHarness(new StrikethroughPlugin(), state);
			expectCommandDispatches(h, 'toggleStrikethrough');
		});
	});

	describe('keymap', () => {
		it('registers Mod-Shift-X keymap', async () => {
			const h = await pluginHarness(new StrikethroughPlugin());
			expectKeyBinding(h, 'Mod-Shift-X');
		});
	});

	describe('toolbar item', () => {
		it('registers a strikethrough toolbar item', async () => {
			const h = await pluginHarness(new StrikethroughPlugin());
			expectToolbarItem(h, 'strikethrough', {
				group: 'format',
				label: 'Strikethrough',
				command: 'toggleStrikethrough',
				hasSvgIcon: true,
			});
		});

		it('toolbar item reports active state', async () => {
			const state = stateBuilder()
				.paragraph('struck', 'b1', {
					marks: [{ type: 'strikethrough' }],
				})
				.cursor('b1', 2)
				.schema(['paragraph'], ['strikethrough'])
				.build();

			const h = await pluginHarness(new StrikethroughPlugin(), state);
			expectToolbarActive(h, 'strikethrough', true);
		});

		it('toolbar item reports inactive state', async () => {
			const state = stateBuilder()
				.paragraph('plain', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], ['strikethrough'])
				.build();

			const h = await pluginHarness(new StrikethroughPlugin(), state);
			expectToolbarActive(h, 'strikethrough', false);
		});

		it('respects separatorAfter config', async () => {
			const h = await pluginHarness(new StrikethroughPlugin({ separatorAfter: true }));
			expectToolbarItem(h, 'strikethrough', { separatorAfter: true });
		});
	});
});
