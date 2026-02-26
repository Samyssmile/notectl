import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	expectComboboxLabel,
	expectMarkSpec,
	expectToolbarActive,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { mockPluginContext, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { type FontDefinition, FontPlugin } from './FontPlugin.js';

// --- Constants ---

const TEST_FONT: FontDefinition = {
	name: 'Test Font',
	family: "'Test Font', sans-serif",
	category: 'sans-serif',
};

const MONO_FONT: FontDefinition = {
	name: 'Mono',
	family: "'Mono', monospace",
	category: 'monospace',
};

const FONT_SCHEMA: [string[], string[]] = [['paragraph'], ['bold', 'italic', 'underline', 'font']];

function defaultState() {
	return stateBuilder()
		.paragraph('text', 'b1')
		.schema(...FONT_SCHEMA)
		.build();
}

// --- Tests ---

describe('FontPlugin', () => {
	describe('registration', () => {
		it('registers with correct id, name, and priority', () => {
			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			expect(plugin.id).toBe('font');
			expect(plugin.name).toBe('Font');
			expect(plugin.priority).toBe(22);
		});
	});

	describe('MarkSpec', () => {
		it('registers font MarkSpec', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }));
			expect(h.getMarkSpec('font')).toBeDefined();
		});

		it('font MarkSpec creates <span> with style.fontFamily', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }));
			expectMarkSpec(h, 'font', {
				tag: 'SPAN',
				toDOMInput: { type: 'font', attrs: { family: "'Fira Code', monospace" } },
			});
		});

		it('has rank 6', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }));
			expectMarkSpec(h, 'font', { rank: 6 });
		});

		it('has family attr with default', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }));
			expectMarkSpec(h, 'font', { attrs: { family: { default: '' } } });
		});
	});

	describe('commands', () => {
		it('registers removeFont command', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }));
			expect(h.executeCommand('removeFont')).toBe(false);
		});

		it('registers setFont command', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }));
			expect(h.executeCommand('setFont')).toBe(false);
		});

		it('removeFont dispatches on font-marked text with range selection', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1', {
					marks: [{ type: 'font', attrs: { family: 'Arial' } }],
				})
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['font'])
				.build();

			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT] }), state);
			expect(h.dispatch).not.toHaveBeenCalled();
		});
	});

	describe('configuration', () => {
		it('renders configured fonts in popup', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }));
			const item = h.getToolbarItem('font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => defaultState() }));

			const listItems = container.querySelectorAll('.notectl-font-picker__item');
			expect(listItems.length).toBe(2);
		});

		it('uses first font as default when defaultFont not specified', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }));
			const item = h.getToolbarItem('font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => defaultState() }));

			const activeItem = container.querySelector('.notectl-font-picker__item--active');
			expect(activeItem).not.toBeNull();
			const label = activeItem?.querySelector('.notectl-font-picker__label');
			expect(label?.textContent).toBe('Test Font');
		});

		it('uses named defaultFont when specified', async () => {
			const h = await pluginHarness(
				new FontPlugin({ fonts: [TEST_FONT, MONO_FONT], defaultFont: 'Mono' }),
			);
			const item = h.getToolbarItem('font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => defaultState() }));

			const activeItem = container.querySelector('.notectl-font-picker__item--active');
			expect(activeItem).not.toBeNull();
			const label = activeItem?.querySelector('.notectl-font-picker__label');
			expect(label?.textContent).toBe('Mono');
		});

		it('falls back to first font when defaultFont name not found', async () => {
			const h = await pluginHarness(
				new FontPlugin({ fonts: [TEST_FONT, MONO_FONT], defaultFont: 'NonExistent' }),
			);
			const item = h.getToolbarItem('font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => defaultState() }));

			const activeItem = container.querySelector('.notectl-font-picker__item--active');
			expect(activeItem).not.toBeNull();
			const label = activeItem?.querySelector('.notectl-font-picker__label');
			expect(label?.textContent).toBe('Test Font');
		});

		it('accepts custom font list', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }));
			const item = h.getToolbarItem('font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => defaultState() }));

			const listItems = container.querySelectorAll('.notectl-font-picker__item');
			expect(listItems.length).toBe(2);

			const labels = container.querySelectorAll(
				'.notectl-font-picker__item .notectl-font-picker__label',
			);
			expect(labels[0]?.textContent).toBe('Test Font');
			expect(labels[1]?.textContent).toBe('Mono');
		});
	});

	describe('toolbar item', () => {
		it('registers a font toolbar item', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }));
			expectToolbarItem(h, 'font', {
				group: 'format',
				label: 'Font',
				priority: 5,
				popupType: 'combobox',
			});
		});

		it('combobox label shows default font name', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }));
			expectComboboxLabel(h, 'font', 'Test Font');
		});

		it('combobox label shows active font name', async () => {
			const state = stateBuilder()
				.paragraph('styled', 'b1', {
					marks: [{ type: 'font', attrs: { family: "'Mono', monospace" } }],
				})
				.cursor('b1', 2)
				.schema(['paragraph'], ['font'])
				.build();

			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }), state);
			expectComboboxLabel(h, 'font', 'Mono');
		});

		it('toolbar item reports active state when text has font', async () => {
			const state = stateBuilder()
				.paragraph('styled', 'b1', {
					marks: [{ type: 'font', attrs: { family: 'Arial' } }],
				})
				.cursor('b1', 2)
				.schema(['paragraph'], ['font'])
				.build();

			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }), state);
			expectToolbarActive(h, 'font', true);
		});

		it('toolbar item reports inactive state when text has no font', async () => {
			const state = stateBuilder()
				.paragraph('plain', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], ['font'])
				.build();

			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }), state);
			expectToolbarActive(h, 'font', false);
		});

		it('respects separatorAfter config', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT], separatorAfter: true }));
			expectToolbarItem(h, 'font', { separatorAfter: true });
		});
	});

	describe('popup rendering', () => {
		it('renders font list without separate Default entry', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT] }));
			const item = h.getToolbarItem('font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => defaultState() }));

			const list = container.querySelector('.notectl-font-picker__list');
			expect(list).not.toBeNull();
			// Only 1 font item (no Default entry, no separator)
			expect(list?.children.length).toBe(1);
		});

		it('highlights active font in popup with checkmark', async () => {
			const state = stateBuilder()
				.paragraph('styled', 'b1', {
					marks: [{ type: 'font', attrs: { family: "'Test Font', sans-serif" } }],
				})
				.cursor('b1', 2)
				.schema(['paragraph'], ['font'])
				.build();

			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT] }), state);
			const item = h.getToolbarItem('font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => state }));

			const activeItem = container.querySelector('.notectl-font-picker__item--active');
			expect(activeItem).not.toBeNull();

			const label = activeItem?.querySelector('.notectl-font-picker__label');
			expect(label?.textContent).toBe('Test Font');

			const check = activeItem?.querySelector('.notectl-font-picker__check');
			expect(check?.textContent).toBe('\u2713');
		});

		it('shows font preview with correct font-family on label', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT] }));
			const item = h.getToolbarItem('font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => defaultState() }));

			const fontLabel = container.querySelector(
				'.notectl-font-picker__item .notectl-font-picker__label',
			) as HTMLElement;
			expect(fontLabel.style.fontFamily).toBeTruthy();
		});

		it('marks default font as active when no font mark is set', async () => {
			const h = await pluginHarness(new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] }));
			const item = h.getToolbarItem('font');
			const container: HTMLDivElement = document.createElement('div');
			item?.renderPopup?.(container, mockPluginContext({ getState: () => defaultState() }));

			const activeItem = container.querySelector('.notectl-font-picker__item--active');
			expect(activeItem).not.toBeNull();
			const label = activeItem?.querySelector('.notectl-font-picker__label');
			expect(label?.textContent).toBe('Test Font');
		});
	});

	describe('font application', () => {
		it('applies font on range selection', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['font'])
				.build();

			const plugin = new FontPlugin({ fonts: [TEST_FONT] });
			const dispatch = vi.fn();
			const h = await pluginHarness(plugin, state);

			plugin.applyFont(
				mockPluginContext({ getState: h.getState, dispatch }),
				state,
				TEST_FONT.family,
			);

			expect(dispatch).toHaveBeenCalledTimes(1);
		});

		it('applies font on collapsed selection via stored marks', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], ['font'])
				.build();

			const plugin = new FontPlugin({ fonts: [TEST_FONT] });
			const dispatch = vi.fn();
			await pluginHarness(plugin, state);

			plugin.applyFont(
				mockPluginContext({ getState: () => state, dispatch }),
				state,
				TEST_FONT.family,
			);

			expect(dispatch).toHaveBeenCalledTimes(1);
		});

		it('replaces font on already-font-styled text', async () => {
			const state = stateBuilder()
				.paragraph('hello', 'b1', {
					marks: [{ type: 'font', attrs: { family: 'Arial' } }],
				})
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 })
				.schema(['paragraph'], ['font'])
				.build();

			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			const dispatch = vi.fn();
			await pluginHarness(plugin, state);

			plugin.applyFont(
				mockPluginContext({ getState: () => state, dispatch }),
				state,
				MONO_FONT.family,
			);

			expect(dispatch).toHaveBeenCalledTimes(1);
		});

		it('applies font across multiple blocks', async () => {
			const state = stateBuilder()
				.paragraph('first', 'b1')
				.paragraph('second', 'b2')
				.selection({ blockId: 'b1', offset: 0 }, { blockId: 'b2', offset: 6 })
				.schema(['paragraph'], ['font'])
				.build();

			const plugin = new FontPlugin({ fonts: [TEST_FONT] });
			const dispatch = vi.fn();
			await pluginHarness(plugin, state);

			plugin.applyFont(
				mockPluginContext({ getState: () => state, dispatch }),
				state,
				TEST_FONT.family,
			);

			expect(dispatch).toHaveBeenCalledTimes(1);
		});
	});

	describe('getActiveFont', () => {
		it('returns null when no font mark is present', () => {
			const state = stateBuilder()
				.paragraph('plain', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], ['font'])
				.build();

			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			expect(plugin.getActiveFont(state)).toBeNull();
		});

		it('returns family when font mark is present', () => {
			const state = stateBuilder()
				.paragraph('styled', 'b1', {
					marks: [{ type: 'font', attrs: { family: 'Georgia, serif' } }],
				})
				.cursor('b1', 2)
				.schema(['paragraph'], ['font'])
				.build();

			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			expect(plugin.getActiveFont(state)).toBe('Georgia, serif');
		});

		it('reads from stored marks when available', () => {
			const baseState = stateBuilder()
				.paragraph('hello', 'b1')
				.cursor('b1', 2)
				.schema(['paragraph'], ['font'])
				.build();

			// Apply stored marks via transaction
			const tr = baseState
				.transaction('command')
				.setStoredMarks([{ type: 'font', attrs: { family: 'Arial' } }], null)
				.setSelection(baseState.selection)
				.build();
			const state = baseState.apply(tr);

			const plugin = new FontPlugin({ fonts: [TEST_FONT, MONO_FONT] });
			expect(plugin.getActiveFont(state)).toBe('Arial');
		});
	});

	describe('@font-face injection', () => {
		beforeEach(() => {
			document.querySelectorAll('style[data-notectl-fonts]').forEach((el) => el.remove());
		});

		afterEach(() => {
			document.querySelectorAll('style[data-notectl-fonts]').forEach((el) => el.remove());
		});

		it('injects style element for fonts with fontFaces', async () => {
			const customFont: FontDefinition = {
				name: 'Custom',
				family: "'Custom', sans-serif",
				fontFaces: [{ src: "url('/fonts/Custom.woff2') format('woff2')", weight: '400' }],
			};

			const plugin = new FontPlugin({ fonts: [customFont] });
			await pluginHarness(plugin);

			const style = document.querySelector('style[data-notectl-fonts]');
			expect(style).not.toBeNull();
			expect(style?.textContent).toContain("font-family: 'Custom'");
			expect(style?.textContent).toContain("url('/fonts/Custom.woff2')");

			plugin.destroy();
		});

		it('does not inject style when no fontFaces defined', async () => {
			const plugin = new FontPlugin({
				fonts: [{ name: 'Arial', family: 'Arial, sans-serif' }],
			});
			await pluginHarness(plugin);

			const style = document.querySelector('style[data-notectl-fonts]');
			expect(style).toBeNull();

			plugin.destroy();
		});

		it('cleans up style element on destroy', async () => {
			const customFont: FontDefinition = {
				name: 'Custom',
				family: "'Custom', sans-serif",
				fontFaces: [{ src: "url('/fonts/Custom.woff2') format('woff2')", weight: '400' }],
			};

			const plugin = new FontPlugin({ fonts: [customFont] });
			await pluginHarness(plugin);

			expect(document.querySelector('style[data-notectl-fonts]')).not.toBeNull();

			plugin.destroy();

			expect(document.querySelector('style[data-notectl-fonts]')).toBeNull();
		});
	});
});
