import { describe, expect, it, vi } from 'vitest';
import { createTextNode } from '../../model/Document.js';
import {
	expectMarkSpec,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { mockPluginContext, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { TextColorPlugin } from './TextColorPlugin.js';

// --- Helpers ---

function defaultState() {
	return stateBuilder().schema(['paragraph'], ['bold', 'italic', 'underline', 'textColor']).build();
}

// --- Tests ---

describe('TextColorPlugin', () => {
	describe('MarkSpec', () => {
		it('textColor MarkSpec creates <span> with style.color', async () => {
			const plugin = new TextColorPlugin();
			const h = await pluginHarness(plugin);

			const spec = h.getMarkSpec('textColor');
			const el = spec?.toDOM({ type: 'textColor', attrs: { color: '#ff0000' } });
			expect(el?.tagName).toBe('SPAN');
			expect(el?.style.color).toBeTruthy();
		});

		it('has rank 5', async () => {
			const plugin = new TextColorPlugin();
			const h = await pluginHarness(plugin);
			expectMarkSpec(h, 'textColor', { rank: 5 });
		});

		it('has color attr with default', async () => {
			const plugin = new TextColorPlugin();
			const h = await pluginHarness(plugin);
			expectMarkSpec(h, 'textColor', { attrs: { color: { default: '' } } });
		});
	});

	describe('command', () => {
		it('registers removeTextColor command', async () => {
			const plugin = new TextColorPlugin();
			const h = await pluginHarness(plugin);
			// With default state (collapsed, no color), removeTextColor returns false
			expect(h.executeCommand('removeTextColor')).toBe(false);
		});
	});

	describe('toolbar item', () => {
		it('registers a textColor toolbar item', async () => {
			const plugin = new TextColorPlugin();
			const h = await pluginHarness(plugin);

			expectToolbarItem(h, 'textColor', {
				group: 'format',
				label: 'Text Color',
				popupType: 'custom',
			});
		});

		it('toolbar item reports active state when text has color', async () => {
			const state = stateBuilder()
				.blockWithInlines(
					'paragraph',
					[createTextNode('colored', [{ type: 'textColor', attrs: { color: '#ff0000' } }])],
					'b1',
				)
				.cursor('b1', 2)
				.schema(['paragraph'], ['textColor'])
				.build();

			const plugin = new TextColorPlugin();
			const h = await pluginHarness(plugin, state);

			expectToolbarActive(h, 'textColor', true);
		});

		it('toolbar item reports inactive state when text has no color', async () => {
			const state = stateBuilder()
				.paragraph('plain', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], ['textColor'])
				.build();

			const plugin = new TextColorPlugin();
			const h = await pluginHarness(plugin, state);

			expectToolbarActive(h, 'textColor', false);
		});
	});

	describe('colors config', () => {
		it('uses default palette when no colors provided', async () => {
			const plugin = new TextColorPlugin();
			const h = await pluginHarness(plugin);

			const item = h.getToolbarItem('textColor');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({
					getState: () => defaultState(),
					dispatch: vi.fn(),
				}),
				vi.fn(),
			);

			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			expect(swatches.length).toBe(70);
		});

		it('restricts palette to custom colors', async () => {
			const plugin = new TextColorPlugin({
				colors: ['#ff0000', '#00ff00', '#0000ff'],
			});
			const h = await pluginHarness(plugin);

			const item = h.getToolbarItem('textColor');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({
					getState: () => defaultState(),
					dispatch: vi.fn(),
				}),
				vi.fn(),
			);

			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			expect(swatches.length).toBe(3);
		});

		it('normalizes colors to lowercase and deduplicates', async () => {
			const plugin = new TextColorPlugin({
				colors: ['#FF0000', '#ff0000', '#00FF00'],
			});
			const h = await pluginHarness(plugin);

			const item = h.getToolbarItem('textColor');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({
					getState: () => defaultState(),
					dispatch: vi.fn(),
				}),
				vi.fn(),
			);

			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			expect(swatches.length).toBe(2);
		});

		it('throws on invalid hex color', () => {
			expect(() => new TextColorPlugin({ colors: ['red'] })).toThrow(
				'TextColorPlugin: invalid hex color(s): red',
			);
		});

		it('throws on hex color without hash', () => {
			expect(() => new TextColorPlugin({ colors: ['ff0000'] })).toThrow(
				'TextColorPlugin: invalid hex color(s): ff0000',
			);
		});

		it('throws listing all invalid values', () => {
			expect(() => new TextColorPlugin({ colors: ['#ff0000', 'bad', 'rgb(0,0,0)'] })).toThrow(
				'TextColorPlugin: invalid hex color(s): bad, rgb(0,0,0)',
			);
		});

		it('falls back to default palette for empty array', async () => {
			const plugin = new TextColorPlugin({ colors: [] });
			const h = await pluginHarness(plugin);

			const item = h.getToolbarItem('textColor');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({
					getState: () => defaultState(),
					dispatch: vi.fn(),
				}),
				vi.fn(),
			);

			const swatches = container.querySelectorAll('.notectl-color-picker__swatch');
			expect(swatches.length).toBe(70);
		});
	});

	describe('styleClasses', () => {
		it('registers a style class per color, also for colors outside the palette', async () => {
			const h = await pluginHarness(
				new TextColorPlugin({
					colors: ['#e03131'],
					styleClasses: { '#E03131': 'text-red', '#1971c2': 'text-blue' },
				}),
			);

			expect(h.pm.schemaRegistry.getStyleClasses()).toEqual([
				{ className: 'text-red', declaration: 'color: #e03131' },
				{ className: 'text-blue', declaration: 'color: #1971c2' },
			]);
		});

		it('fails initialization for a key that is not a hex color', async () => {
			const plugin = new TextColorPlugin({ styleClasses: { red: 'text-red' } });

			await expect(pluginHarness(plugin)).rejects.toThrow(
				'TextColorPlugin styleClasses: "red" is not a hex color; use keys such as "#e03131".',
			);
		});

		it('fails initialization for an invalid class name', async () => {
			const plugin = new TextColorPlugin({ styleClasses: { '#e03131': 'text red' } });

			await expect(pluginHarness(plugin)).rejects.toThrow(
				'TextColorPlugin styleClasses: Invalid class name "text red" for "color: #e03131"',
			);
		});

		it('removes its style classes when the editor is destroyed', async () => {
			const h = await pluginHarness(
				new TextColorPlugin({ styleClasses: { '#e03131': 'text-red' } }),
			);

			await h.pm.destroy();

			expect(h.pm.schemaRegistry.getStyleClasses()).toEqual([]);
		});
	});
});
