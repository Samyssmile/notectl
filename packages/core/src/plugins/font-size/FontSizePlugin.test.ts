import { describe, expect, it, vi } from 'vitest';
import type { EditorState } from '../../state/EditorState.js';
import {
	expectCommandDispatches,
	expectMarkSpec,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { mockPluginContext, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { DEFAULT_FONT_SIZES, FontSizePlugin } from './FontSizePlugin.js';

// --- Helpers ---

function defaultState(): EditorState {
	return stateBuilder().schema(['paragraph'], ['bold', 'italic', 'underline', 'fontSize']).build();
}

// --- Tests ---

describe('FontSizePlugin', () => {
	describe('registration', () => {
		it('registers with correct id, name, and priority', () => {
			const plugin = new FontSizePlugin();
			expect(plugin.id).toBe('fontSize');
			expect(plugin.name).toBe('Font Size');
			expect(plugin.priority).toBe(21);
		});
	});

	describe('MarkSpec', () => {
		it('registers fontSize MarkSpec', async () => {
			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin);
			expectMarkSpec(h, 'fontSize');
		});

		it('fontSize MarkSpec creates <span> with style.fontSize', async () => {
			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin);

			const spec = h.getMarkSpec('fontSize');
			const el = spec?.toDOM({
				type: 'fontSize',
				attrs: { size: '24px' },
			});
			expect(el?.tagName).toBe('SPAN');
			expect(el?.style.fontSize).toBe('24px');
		});

		it('has rank 4', async () => {
			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin);
			expectMarkSpec(h, 'fontSize', { rank: 4 });
		});

		it('has size attr with default', async () => {
			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin);
			expectMarkSpec(h, 'fontSize', { attrs: { size: { default: '' } } });
		});
	});

	describe('commands', () => {
		it('registers removeFontSize command', async () => {
			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin);
			expect(h.executeCommand('removeFontSize')).toBe(false);
		});

		it('registers setFontSize command (placeholder)', async () => {
			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin);
			expect(h.executeCommand('setFontSize')).toBe(false);
		});

		it('registers increaseFontSize command', async () => {
			const plugin = new FontSizePlugin();
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['fontSize'])
				.build();
			const h = await pluginHarness(plugin, state);
			expectCommandDispatches(h, 'increaseFontSize');
		});

		it('registers decreaseFontSize command', async () => {
			const plugin = new FontSizePlugin();
			const state = stateBuilder()
				.paragraph('hello', 'b1', {
					marks: [{ type: 'fontSize', attrs: { size: '24px' } }],
				})
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['fontSize'])
				.build();
			const h = await pluginHarness(plugin, state);
			expectCommandDispatches(h, 'decreaseFontSize');
		});
	});

	describe('toolbar item', () => {
		it('registers a fontSize toolbar item', async () => {
			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin);

			expectToolbarItem(h, 'fontSize', {
				group: 'format',
				label: 'Font Size',
				priority: 6,
				popupType: 'custom',
			});
		});

		it('toolbar item reports active state when text has fontSize', async () => {
			const state = stateBuilder()
				.paragraph('sized', 'b1', {
					marks: [{ type: 'fontSize', attrs: { size: '24px' } }],
				})
				.cursor('b1', 2)
				.schema(['paragraph'], ['fontSize'])
				.build();

			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin, state);

			expectToolbarActive(h, 'fontSize', true);
		});

		it('toolbar item reports inactive when text has no fontSize', async () => {
			const state = stateBuilder()
				.paragraph('plain', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], ['fontSize'])
				.build();

			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin, state);

			expectToolbarActive(h, 'fontSize', false);
		});

		it('respects separatorAfter config', async () => {
			const plugin = new FontSizePlugin({ separatorAfter: true });
			const h = await pluginHarness(plugin);

			expectToolbarItem(h, 'fontSize', { separatorAfter: true });
		});
	});

	describe('custom sizes config', () => {
		it('uses default sizes when no sizes provided', async () => {
			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin);

			const item = h.getToolbarItem('fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({ getState: () => defaultState(), dispatch: vi.fn() }),
			);

			const listItems = container.querySelectorAll('.notectl-font-size-picker__item');
			expect(listItems.length).toBe(DEFAULT_FONT_SIZES.length);
		});

		it('renders custom sizes when provided', async () => {
			const plugin = new FontSizePlugin({ sizes: [12, 16, 24, 48] });
			const h = await pluginHarness(plugin);

			const item = h.getToolbarItem('fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({ getState: () => defaultState(), dispatch: vi.fn() }),
			);

			const listItems = container.querySelectorAll('.notectl-font-size-picker__item');
			expect(listItems.length).toBe(4);

			const labels = [...container.querySelectorAll('.notectl-font-size-picker__label')].map(
				(el) => el.textContent,
			);
			expect(labels).toEqual(['12', '16', '24', '48']);
		});

		it('sorts and deduplicates custom sizes', async () => {
			const plugin = new FontSizePlugin({ sizes: [48, 12, 24, 12, 48] });
			const h = await pluginHarness(plugin);

			const item = h.getToolbarItem('fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({ getState: () => defaultState(), dispatch: vi.fn() }),
			);

			const labels = [...container.querySelectorAll('.notectl-font-size-picker__label')].map(
				(el) => el.textContent,
			);
			expect(labels).toEqual(['12', '24', '48']);
		});

		it('falls back to defaults when empty array is provided', async () => {
			const plugin = new FontSizePlugin({ sizes: [] });
			const h = await pluginHarness(plugin);

			const item = h.getToolbarItem('fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({ getState: () => defaultState(), dispatch: vi.fn() }),
			);

			const listItems = container.querySelectorAll('.notectl-font-size-picker__item');
			expect(listItems.length).toBe(DEFAULT_FONT_SIZES.length);
		});

		it('uses custom defaultSize in toolbar combo label', async () => {
			const plugin = new FontSizePlugin({ sizes: [12, 16, 24], defaultSize: 12 });
			const h = await pluginHarness(plugin);

			const item = h.getToolbarItem('fontSize');
			expect(item?.icon).toContain('12');
		});

		it('defaultSize is shown in popup input when no mark is active', async () => {
			const plugin = new FontSizePlugin({ defaultSize: 12 });
			const h = await pluginHarness(plugin);

			const item = h.getToolbarItem('fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({ getState: () => defaultState(), dispatch: vi.fn() }),
			);

			const input = container.querySelector('.notectl-font-size-picker__input') as HTMLInputElement;
			expect(input.value).toBe('12');
		});

		it('selecting defaultSize removes the fontSize mark', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1', {
					marks: [{ type: 'fontSize', attrs: { size: '24px' } }],
				})
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['fontSize'])
				.build();

			const plugin = new FontSizePlugin({ sizes: [12, 24, 48], defaultSize: 12 });
			const h = await pluginHarness(plugin, state);

			// Decrease from 24 → should hit 12 (the defaultSize) → removes mark
			h.executeCommand('decreaseFontSize');
			expect(h.dispatch).toHaveBeenCalled();
			const tr = h.dispatch.mock.calls[0]?.[0];
			const steps = tr.steps;
			const hasAddMark = steps.some((s: { type: string }) => s.type === 'addMark');
			expect(hasAddMark).toBe(false);
		});

		it('increase/decrease steps through custom sizes', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['fontSize'])
				.build();

			const plugin = new FontSizePlugin({ sizes: [10, 16, 32, 64] });
			const h = await pluginHarness(plugin, state);

			// Default is 16, increase should jump to 32 (not 18)
			h.executeCommand('increaseFontSize');
			expect(h.dispatch).toHaveBeenCalled();
			const tr = h.dispatch.mock.calls[0]?.[0];
			const steps = tr.steps;
			const addMarkStep = steps.find((s: { type: string }) => s.type === 'addMark');
			expect(addMarkStep.mark.attrs.size).toBe('32px');
		});
	});

	describe('popup', () => {
		it('renders a list with 17 preset items', async () => {
			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin);

			const item = h.getToolbarItem('fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({ getState: () => defaultState(), dispatch: vi.fn() }),
			);

			const listItems = container.querySelectorAll('.notectl-font-size-picker__item');
			expect(listItems.length).toBe(17);
		});

		it('renders a custom size input field', async () => {
			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin);

			const item = h.getToolbarItem('fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({ getState: () => defaultState(), dispatch: vi.fn() }),
			);

			const input = container.querySelector('.notectl-font-size-picker__input') as HTMLInputElement;
			expect(input).toBeDefined();
			expect(input.type).toBe('number');
			expect(input.getAttribute('aria-label')).toBe('Custom font size');
		});

		it('marks active preset with aria-selected', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1', {
					marks: [{ type: 'fontSize', attrs: { size: '24px' } }],
				})
				.cursor('b1', 2)
				.schema(['paragraph'], ['fontSize'])
				.build();

			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin, state);

			const item = h.getToolbarItem('fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({ getState: () => state, dispatch: vi.fn() }),
			);

			const activeItem = container.querySelector('.notectl-font-size-picker__item--active');
			expect(activeItem).toBeDefined();
			expect(activeItem?.getAttribute('aria-selected')).toBe('true');
		});

		it('list has role=listbox and items have role=option', async () => {
			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin);

			const item = h.getToolbarItem('fontSize');

			const container = document.createElement('div');
			item?.renderPopup?.(
				container,
				mockPluginContext({ getState: () => defaultState(), dispatch: vi.fn() }),
			);

			const list = container.querySelector('.notectl-font-size-picker__list');
			expect(list?.getAttribute('role')).toBe('listbox');

			const options = container.querySelectorAll('[role="option"]');
			expect(options.length).toBe(17);
		});
	});

	describe('increase / decrease', () => {
		it('increases from default 16 to 18', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['fontSize'])
				.build();

			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin, state);

			expectCommandDispatches(h, 'increaseFontSize');
		});

		it('does not increase beyond max preset (96)', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1', {
					marks: [{ type: 'fontSize', attrs: { size: '96px' } }],
				})
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['fontSize'])
				.build();

			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin, state);
			h.dispatch.mockClear();

			h.executeCommand('increaseFontSize');
			expect(h.dispatch).not.toHaveBeenCalled();
		});

		it('does not decrease below min preset (8)', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1', {
					marks: [{ type: 'fontSize', attrs: { size: '8px' } }],
				})
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['fontSize'])
				.build();

			const plugin = new FontSizePlugin();
			const h = await pluginHarness(plugin, state);
			h.dispatch.mockClear();

			h.executeCommand('decreaseFontSize');
			expect(h.dispatch).not.toHaveBeenCalled();
		});
	});
});
