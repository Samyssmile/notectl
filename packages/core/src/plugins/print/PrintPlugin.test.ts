import { describe, expect, it, vi } from 'vitest';
import {
	expectCommandRegistered,
	expectKeyBinding,
	expectToolbarItem,
} from '../../test/PluginTestUtils.js';
import { makePluginOptions } from '../../test/TestUtils.js';
import { pluginHarness } from '../../test/TestUtils.js';
import { PluginManager } from '../PluginManager.js';
import { PrintPlugin } from './PrintPlugin.js';
import { PRINT_SERVICE_KEY } from './PrintTypes.js';

describe('PrintPlugin', () => {
	it('registers the print command', async () => {
		const h = await pluginHarness(new PrintPlugin());
		expectCommandRegistered(h, 'print');
	});

	it('registers the Mod-P key binding by default', async () => {
		const h = await pluginHarness(new PrintPlugin());
		expectKeyBinding(h, 'Mod-P');
	});

	it('registers the print toolbar item in actions group', async () => {
		const h = await pluginHarness(new PrintPlugin());
		expectToolbarItem(h, 'print', {
			group: 'actions',
			command: 'print',
			label: 'Print',
		});
	});

	it('uses platform-formatted shortcut in tooltip', async () => {
		const h = await pluginHarness(new PrintPlugin());
		const item = h.getToolbarItem('print');
		expect(item?.tooltip).toMatch(/Print \((?:Ctrl\+P|⌘P)\)/);
	});

	it('registers the PrintService', async () => {
		const h = await pluginHarness(new PrintPlugin());
		const service = h.pm.getService(PRINT_SERVICE_KEY);
		expect(service).toBeDefined();
		expect(service?.print).toBeTypeOf('function');
		expect(service?.toHTML).toBeTypeOf('function');
	});

	it('supports custom key binding', async () => {
		const h = await pluginHarness(new PrintPlugin({ keyBinding: 'Mod-Shift-p' }));
		expectKeyBinding(h, 'Mod-Shift-p');
	});

	it('hides toolbar item when showToolbarItem is false', async () => {
		const h = await pluginHarness(new PrintPlugin({ showToolbarItem: false }));
		const item = h.getToolbarItem('print');
		expect(item).toBeUndefined();
	});

	it('announces print action for screen readers', async () => {
		const announceSpy = vi.fn();
		const pm = new PluginManager();
		pm.register(new PrintPlugin());
		await pm.init(makePluginOptions({ announce: announceSpy }));

		pm.executeCommand('print');
		expect(announceSpy).toHaveBeenCalledWith('Printing');
	});
});
