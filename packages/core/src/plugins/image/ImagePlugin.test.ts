import { describe, expect, it } from 'vitest';
import { createBlockNode } from '../../model/Document.js';
import { blockId, nodeType } from '../../model/TypeBrands.js';
import { mockPluginContext, pluginHarness, stateBuilder } from '../../test/TestUtils.js';
import { ImagePlugin } from './ImagePlugin.js';

// --- Helpers ---

const IMAGE_SCHEMA_NODES: string[] = ['paragraph', 'image'];
const IMAGE_SCHEMA_MARKS: string[] = ['bold', 'italic'];

function defaultState() {
	return stateBuilder()
		.paragraph('', 'b1')
		.cursor('b1', 0)
		.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
		.build();
}

// --- Tests ---

describe('ImagePlugin', () => {
	describe('registration', () => {
		it('registers with correct id and name', () => {
			const plugin = new ImagePlugin();
			expect(plugin.id).toBe('image');
			expect(plugin.name).toBe('Image');
			expect(plugin.priority).toBe(45);
		});
	});

	describe('NodeSpec', () => {
		it('registers image NodeSpec', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const spec = pm.schemaRegistry.getNodeSpec('image');
			expect(spec).toBeDefined();
		});

		it('NodeSpec is void', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const spec = pm.schemaRegistry.getNodeSpec('image');
			expect(spec?.isVoid).toBe(true);
		});

		it('NodeSpec is selectable', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const spec = pm.schemaRegistry.getNodeSpec('image');
			expect(spec?.selectable).toBe(true);
		});

		it('toDOM creates figure with img', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const spec = pm.schemaRegistry.getNodeSpec('image');

			const block = createBlockNode(nodeType('image'), [], blockId('test'), {
				src: 'photo.jpg',
				alt: 'A photo',
				align: 'center',
			});

			const el = spec?.toDOM(block);
			expect(el?.tagName).toBe('FIGURE');
			expect(el?.getAttribute('data-block-id')).toBe('test');
			expect(el?.getAttribute('data-void')).toBe('true');
			expect(el?.querySelector('img')?.getAttribute('src')).toBe('photo.jpg');
		});

		it('toDOM sets aria-label with alt text and dimensions', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const spec = pm.schemaRegistry.getNodeSpec('image');

			const block = createBlockNode(nodeType('image'), [], blockId('test'), {
				src: 'photo.jpg',
				alt: 'A photo',
				align: 'center',
				width: 400,
				height: 300,
			});

			const el = spec?.toDOM(block);
			const label: string | null = el?.getAttribute('aria-label') ?? null;
			expect(label).toContain('A photo');
			expect(label).toContain('400 by 300 pixels');
		});

		it('toDOM sets aria-label to "Image" when alt is empty', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const spec = pm.schemaRegistry.getNodeSpec('image');

			const block = createBlockNode(nodeType('image'), [], blockId('test'), {
				src: 'photo.jpg',
				alt: '',
				align: 'center',
			});

			const el = spec?.toDOM(block);
			expect(el?.getAttribute('aria-label')).toBe('Image');
		});

		it('toDOM applies alignment class', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const spec = pm.schemaRegistry.getNodeSpec('image');

			const block = createBlockNode(nodeType('image'), [], blockId('test'), {
				src: 'photo.jpg',
				alt: '',
				align: 'left',
			});

			const el = spec?.toDOM(block);
			expect(el?.classList.contains('notectl-image--left')).toBe(true);
		});
	});

	describe('commands', () => {
		it('registers insertImage command', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			expect(pm.executeCommand('insertImage')).toBe(true);
		});

		it('registers removeImage command', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			// Returns false because no NodeSelection on image
			expect(pm.executeCommand('removeImage')).toBe(false);
		});
	});

	describe('toolbar', () => {
		it('registers image toolbar item', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const item = pm.toolbarRegistry.getToolbarItem('image');
			expect(item).toBeDefined();
			expect(item?.group).toBe('insert');
			expect(item?.command).toBe('insertImage');
		});

		it('toolbar item has popupType custom', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const item = pm.toolbarRegistry.getToolbarItem('image');
			expect(item?.popupType).toBe('custom');
		});

		it('toolbar item has renderPopup function', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const item = pm.toolbarRegistry.getToolbarItem('image');
			expect(item).toBeDefined();
			if (!item) return;
			expect('renderPopup' in item).toBe(true);
			expect(typeof (item as { renderPopup: unknown }).renderPopup).toBe('function');
		});

		it('renderPopup creates upload button and URL input', async () => {
			const plugin = new ImagePlugin();
			const { pm, getState, dispatch } = await pluginHarness(plugin, defaultState());
			const item = pm.toolbarRegistry.getToolbarItem('image');
			const container: HTMLDivElement = document.createElement('div');
			const ctx = mockPluginContext({ getState, dispatch });
			(item as { renderPopup(c: HTMLElement, ctx: unknown): void }).renderPopup(container, ctx);

			const fileInput: HTMLInputElement | null = container.querySelector('input[type="file"]');
			expect(fileInput).not.toBeNull();
			expect(fileInput?.getAttribute('accept')).toContain('image/png');

			const urlInput: HTMLInputElement | null = container.querySelector('input[type="url"]');
			expect(urlInput).not.toBeNull();
			expect(urlInput?.getAttribute('placeholder')).toBe('https://...');

			const buttons: NodeListOf<HTMLButtonElement> = container.querySelectorAll('button');
			expect(buttons).toHaveLength(2);
			expect(buttons[0]?.textContent).toBe('Upload from computer');
			expect(buttons[1]?.textContent).toBe('Insert');
		});

		it('upload button is keyboard accessible', async () => {
			const plugin = new ImagePlugin();
			const { pm, getState, dispatch } = await pluginHarness(plugin, defaultState());
			const item = pm.toolbarRegistry.getToolbarItem('image');
			const container: HTMLDivElement = document.createElement('div');
			const ctx = mockPluginContext({ getState, dispatch });
			(item as { renderPopup(c: HTMLElement, ctx: unknown): void }).renderPopup(container, ctx);

			const uploadBtn: HTMLButtonElement | null = container.querySelector(
				'button[aria-label="Upload image from computer"]',
			);
			expect(uploadBtn).not.toBeNull();
			expect(uploadBtn?.type).toBe('button');
		});

		it('insert button has aria-label', async () => {
			const plugin = new ImagePlugin();
			const { pm, getState, dispatch } = await pluginHarness(plugin, defaultState());
			const item = pm.toolbarRegistry.getToolbarItem('image');
			const container: HTMLDivElement = document.createElement('div');
			const ctx = mockPluginContext({ getState, dispatch });
			(item as { renderPopup(c: HTMLElement, ctx: unknown): void }).renderPopup(container, ctx);

			const insertBtn: HTMLButtonElement | null = container.querySelector(
				'button[aria-label="Insert image"]',
			);
			expect(insertBtn).not.toBeNull();
		});
	});

	describe('config', () => {
		it('uses default config', () => {
			const plugin = new ImagePlugin();
			expect(plugin.id).toBe('image');
		});

		it('accepts custom config', () => {
			const plugin = new ImagePlugin({ maxWidth: 1200, resizable: false });
			expect(plugin.id).toBe('image');
		});
	});

	describe('toHTML', () => {
		it('serializes image to HTML string', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const spec = pm.schemaRegistry.getNodeSpec('image');

			const block = createBlockNode(nodeType('image'), [], blockId('test'), {
				src: 'photo.jpg',
				alt: 'A photo',
				align: 'center',
				width: 400,
				height: 300,
			});

			const html = spec?.toHTML?.(block, '');
			expect(html).toContain('src="photo.jpg"');
			expect(html).toContain('alt="A photo"');
			expect(html).toContain('width="400"');
			expect(html).toContain('height="300"');
			expect(html).toContain('notectl-image--center');
		});
	});

	describe('parseHTML', () => {
		it('registers parse rules for figure and img', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const spec = pm.schemaRegistry.getNodeSpec('image');
			expect(spec?.parseHTML).toHaveLength(2);
			expect(spec?.parseHTML?.[0]?.tag).toBe('figure');
			expect(spec?.parseHTML?.[1]?.tag).toBe('img');
		});
	});

	describe('resize commands', () => {
		it('registers resizeImageGrow command', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			// Returns false because no NodeSelection on image with dimensions
			expect(pm.executeCommand('resizeImageGrow')).toBe(false);
		});

		it('registers resizeImageShrink command', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			expect(pm.executeCommand('resizeImageShrink')).toBe(false);
		});

		it('registers resizeImageGrowLarge command', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			expect(pm.executeCommand('resizeImageGrowLarge')).toBe(false);
		});

		it('registers resizeImageShrinkLarge command', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			expect(pm.executeCommand('resizeImageShrinkLarge')).toBe(false);
		});

		it('registers resetImageSize command', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			expect(pm.executeCommand('resetImageSize')).toBe(false);
		});
	});

	describe('keymaps', () => {
		it('registers default keymaps', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const keymaps = pm.keymapRegistry.getKeymaps();
			expect(keymaps.length).toBeGreaterThan(0);

			// Check that at least one keymap contains resize bindings
			const hasResizeBinding: boolean = keymaps.some(
				(km) => 'Mod-Shift-ArrowRight' in km || 'Mod-Shift-ArrowLeft' in km,
			);
			expect(hasResizeBinding).toBe(true);
		});

		it('accepts custom keymaps', async () => {
			const plugin = new ImagePlugin({
				keymap: { growWidth: 'Mod-Alt-ArrowRight', shrinkWidth: 'Mod-Alt-ArrowLeft' },
			});
			const { pm } = await pluginHarness(plugin, defaultState());
			const keymaps = pm.keymapRegistry.getKeymaps();

			const hasCustomBinding: boolean = keymaps.some((km) => 'Mod-Alt-ArrowRight' in km);
			expect(hasCustomBinding).toBe(true);
		});

		it('disables keymap when set to null', async () => {
			const plugin = new ImagePlugin({
				keymap: { growWidth: null, shrinkWidth: null },
			});
			const { pm } = await pluginHarness(plugin, defaultState());
			const keymaps = pm.keymapRegistry.getKeymaps();

			// Default grow/shrink should not be bound
			const hasDefaultGrow: boolean = keymaps.some((km) => 'Mod-Shift-ArrowRight' in km);
			const hasDefaultShrink: boolean = keymaps.some((km) => 'Mod-Shift-ArrowLeft' in km);
			expect(hasDefaultGrow).toBe(false);
			expect(hasDefaultShrink).toBe(false);
		});
	});

	describe('onStateChange: announcements', () => {
		it('runs without error when selecting an image', async () => {
			const oldState = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', {
					attrs: {
						src: 'test.png',
						alt: 'A photo',
						align: 'center',
						width: 400,
						height: 300,
					},
				})
				.cursor('b1', 0)
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			await pluginHarness(plugin, oldState);

			const newState = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', {
					attrs: {
						src: 'test.png',
						alt: 'A photo',
						align: 'center',
						width: 400,
						height: 300,
					},
				})
				.nodeSelection('img1')
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();

			const tr = newState.transaction('command').build();
			expect(() => plugin.onStateChange?.(oldState, newState, tr)).not.toThrow();
		});

		it('runs without error when transitioning between non-image states', async () => {
			const oldState = stateBuilder()
				.paragraph('Hello', 'b1')
				.paragraph('World', 'b2')
				.cursor('b1', 0)
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			await pluginHarness(plugin, oldState);

			const newState = stateBuilder()
				.paragraph('Hello', 'b1')
				.paragraph('World', 'b2')
				.cursor('b2', 0)
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();

			const tr = newState.transaction('command').build();
			expect(() => plugin.onStateChange?.(oldState, newState, tr)).not.toThrow();
		});

		it('runs without error when deselecting an image', async () => {
			const oldState = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', {
					attrs: { src: 'test.png', alt: '', align: 'center' },
				})
				.nodeSelection('img1')
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();
			const plugin = new ImagePlugin();
			await pluginHarness(plugin, oldState);

			const newState = stateBuilder()
				.paragraph('', 'b1')
				.block('image', '', 'img1', {
					attrs: { src: 'test.png', alt: '', align: 'center' },
				})
				.cursor('b1', 0)
				.schema(IMAGE_SCHEMA_NODES, IMAGE_SCHEMA_MARKS)
				.build();

			const tr = newState.transaction('command').build();
			expect(() => plugin.onStateChange?.(oldState, newState, tr)).not.toThrow();
		});
	});

	describe('destroy', () => {
		it('cleans up context reference', async () => {
			const plugin = new ImagePlugin();
			await pluginHarness(plugin, defaultState());

			plugin.destroy();
			// After destroy, onStateChange should not crash
			const state = defaultState();
			const tr = state.transaction('command').build();
			expect(() => plugin.onStateChange?.(state, state, tr)).not.toThrow();
		});
	});
});
