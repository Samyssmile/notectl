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

		it('registers alignment commands', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			// Returns false because no NodeSelection on image
			expect(pm.executeCommand('setImageAlignLeft')).toBe(false);
			expect(pm.executeCommand('setImageAlignCenter')).toBe(false);
			expect(pm.executeCommand('setImageAlignRight')).toBe(false);
		});
	});

	describe('toolbar', () => {
		it('registers image toolbar item', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const item = pm.schemaRegistry.getToolbarItem('image');
			expect(item).toBeDefined();
			expect(item?.group).toBe('insert');
			expect(item?.command).toBe('insertImage');
		});

		it('toolbar item has popupType custom', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const item = pm.schemaRegistry.getToolbarItem('image');
			expect(item?.popupType).toBe('custom');
		});

		it('toolbar item has renderPopup function', async () => {
			const plugin = new ImagePlugin();
			const { pm } = await pluginHarness(plugin, defaultState());
			const item = pm.schemaRegistry.getToolbarItem('image');
			expect(item).toBeDefined();
			if (!item) return;
			expect('renderPopup' in item).toBe(true);
			expect(typeof (item as { renderPopup: unknown }).renderPopup).toBe('function');
		});

		it('renderPopup creates upload label and URL input', async () => {
			const plugin = new ImagePlugin();
			const { pm, getState, dispatch } = await pluginHarness(plugin, defaultState());
			const item = pm.schemaRegistry.getToolbarItem('image');
			const container: HTMLDivElement = document.createElement('div');
			const ctx = mockPluginContext({ getState, dispatch });
			(item as { renderPopup(c: HTMLElement, ctx: unknown): void }).renderPopup(container, ctx);

			const fileInput: HTMLInputElement | null = container.querySelector('input[type="file"]');
			expect(fileInput).not.toBeNull();
			expect(fileInput?.getAttribute('accept')).toContain('image/png');

			const urlInput: HTMLInputElement | null = container.querySelector('input[type="url"]');
			expect(urlInput).not.toBeNull();
			expect(urlInput?.getAttribute('placeholder')).toBe('https://...');

			const button: HTMLButtonElement | null = container.querySelector('button');
			expect(button).not.toBeNull();
			expect(button?.textContent).toBe('Insert');
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
});
