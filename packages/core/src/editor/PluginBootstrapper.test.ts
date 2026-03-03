import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from '../plugins/Plugin.js';
import { PluginManager } from '../plugins/PluginManager.js';
import { ensureEssentialPlugins, processToolbarConfig } from './PluginBootstrapper.js';

function stubPlugin(id: string): Plugin {
	return { id, init: vi.fn() };
}

describe('processToolbarConfig', () => {
	it('registers toolbar plugins from shorthand groups', async () => {
		const pm = new PluginManager();
		const bold: Plugin = stubPlugin('bold');
		const italic: Plugin = stubPlugin('italic');
		const heading: Plugin = stubPlugin('heading');

		await processToolbarConfig(pm, [[bold, italic], [heading]]);

		expect(pm.get('bold')).toBe(bold);
		expect(pm.get('italic')).toBe(italic);
		expect(pm.get('heading')).toBe(heading);
		expect(pm.get('toolbar')).toBeDefined();
	});

	it('registers toolbar plugins from full ToolbarConfig', async () => {
		const pm = new PluginManager();
		const bold: Plugin = stubPlugin('bold');

		await processToolbarConfig(pm, { groups: [[bold]], overflow: undefined });

		expect(pm.get('bold')).toBe(bold);
		expect(pm.get('toolbar')).toBeDefined();
	});

	it('does nothing when toolbar is undefined', async () => {
		const pm = new PluginManager();

		await processToolbarConfig(pm, undefined);

		expect(pm.getPluginIds()).toHaveLength(0);
	});
});

describe('ensureEssentialPlugins', () => {
	it('registers text-formatting, caret-navigation, and gap-cursor', async () => {
		const pm = new PluginManager();

		await ensureEssentialPlugins(pm);

		expect(pm.get('text-formatting')).toBeDefined();
		expect(pm.get('caret-navigation')).toBeDefined();
		expect(pm.get('gap-cursor')).toBeDefined();
	});

	it('skips text-formatting if already registered', async () => {
		const pm = new PluginManager();
		const existing: Plugin = stubPlugin('text-formatting');
		pm.register(existing);

		await ensureEssentialPlugins(pm);

		expect(pm.get('text-formatting')).toBe(existing);
	});

	it('skips caret-navigation if already registered', async () => {
		const pm = new PluginManager();
		const existing: Plugin = stubPlugin('caret-navigation');
		pm.register(existing);

		await ensureEssentialPlugins(pm);

		expect(pm.get('caret-navigation')).toBe(existing);
	});

	it('skips gap-cursor if already registered', async () => {
		const pm = new PluginManager();
		const existing: Plugin = stubPlugin('gap-cursor');
		pm.register(existing);

		await ensureEssentialPlugins(pm);

		expect(pm.get('gap-cursor')).toBe(existing);
	});

	it('passes feature config to text-formatting', async () => {
		const pm = new PluginManager();

		await ensureEssentialPlugins(pm, { bold: false, italic: true });

		expect(pm.get('text-formatting')).toBeDefined();
	});
});
