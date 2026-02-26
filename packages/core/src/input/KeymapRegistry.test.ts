import { type MockInstance, describe, expect, it, vi } from 'vitest';
import type { Keymap } from './Keymap.js';
import { KeymapRegistry } from './KeymapRegistry.js';

describe('KeymapRegistry', () => {
	it('registers and retrieves keymaps', () => {
		const registry = new KeymapRegistry();
		const keymap: Keymap = { 'Mod-B': () => true };
		registry.registerKeymap(keymap);
		expect(registry.getKeymaps()).toEqual([keymap]);
	});

	it('removes a keymap', () => {
		const registry = new KeymapRegistry();
		const keymap: Keymap = { 'Mod-B': () => true };
		registry.registerKeymap(keymap);
		registry.removeKeymap(keymap);
		expect(registry.getKeymaps()).toEqual([]);
	});

	it('logs debug message when a keymap shortcut collides with an existing one', () => {
		const registry = new KeymapRegistry();
		const spy: MockInstance = vi.spyOn(console, 'debug').mockImplementation(() => {});

		registry.registerKeymap({ 'Mod-B': () => true });
		registry.registerKeymap({ 'Mod-B': () => false });

		expect(spy).toHaveBeenCalledOnce();
		expect(spy).toHaveBeenCalledWith(
			'[notectl] Keymap shortcut "Mod-B" is already registered and will be overridden.',
		);

		spy.mockRestore();
	});

	it('does not log for non-overlapping keymaps', () => {
		const registry = new KeymapRegistry();
		const spy: MockInstance = vi.spyOn(console, 'debug').mockImplementation(() => {});

		registry.registerKeymap({ 'Mod-B': () => true });
		registry.registerKeymap({ 'Mod-I': () => true });

		expect(spy).not.toHaveBeenCalled();

		spy.mockRestore();
	});

	it('debug message includes the colliding key descriptor', () => {
		const registry = new KeymapRegistry();
		const spy: MockInstance = vi.spyOn(console, 'debug').mockImplementation(() => {});

		registry.registerKeymap({ 'Mod-Shift-1': () => true });
		registry.registerKeymap({ 'Mod-Shift-1': () => false, 'Mod-Shift-2': () => true });

		expect(spy).toHaveBeenCalledOnce();
		expect(String(spy.mock.calls[0]?.[0])).toContain('Mod-Shift-1');

		spy.mockRestore();
	});

	it('defaults to "default" priority when no options provided', () => {
		const registry = new KeymapRegistry();
		const keymap: Keymap = { 'Mod-B': () => true };
		registry.registerKeymap(keymap);
		const groups = registry.getKeymapsByPriority();
		expect(groups.default).toEqual([keymap]);
		expect(groups.context).toEqual([]);
		expect(groups.navigation).toEqual([]);
	});

	it('registerKeymap with context priority stores in context group', () => {
		const registry = new KeymapRegistry();
		const keymap: Keymap = { Tab: () => true };
		registry.registerKeymap(keymap, { priority: 'context' });
		const groups = registry.getKeymapsByPriority();
		expect(groups.context).toEqual([keymap]);
		expect(groups.navigation).toEqual([]);
		expect(groups.default).toEqual([]);
	});

	it('registerKeymap with navigation priority stores in navigation group', () => {
		const registry = new KeymapRegistry();
		const keymap: Keymap = { ArrowDown: () => true };
		registry.registerKeymap(keymap, { priority: 'navigation' });
		const groups = registry.getKeymapsByPriority();
		expect(groups.navigation).toEqual([keymap]);
		expect(groups.context).toEqual([]);
		expect(groups.default).toEqual([]);
	});

	it('getKeymaps returns all keymaps in priority order: context > navigation > default', () => {
		const registry = new KeymapRegistry();
		const ctxKeymap: Keymap = { Tab: () => true };
		const navKeymap: Keymap = { ArrowDown: () => true };
		const defKeymap: Keymap = { 'Mod-B': () => true };

		registry.registerKeymap(defKeymap);
		registry.registerKeymap(ctxKeymap, { priority: 'context' });
		registry.registerKeymap(navKeymap, { priority: 'navigation' });

		const all = registry.getKeymaps();
		expect(all).toEqual([ctxKeymap, navKeymap, defKeymap]);
	});

	it('removeKeymap removes from the correct priority array', () => {
		const registry = new KeymapRegistry();
		const ctxKeymap: Keymap = { Tab: () => true };
		const defKeymap: Keymap = { 'Mod-B': () => true };

		registry.registerKeymap(ctxKeymap, { priority: 'context' });
		registry.registerKeymap(defKeymap);

		registry.removeKeymap(ctxKeymap);
		const groups = registry.getKeymapsByPriority();
		expect(groups.context).toEqual([]);
		expect(groups.default).toEqual([defKeymap]);
	});

	it('clear resets all priority arrays', () => {
		const registry = new KeymapRegistry();
		registry.registerKeymap({ Tab: () => true }, { priority: 'context' });
		registry.registerKeymap({ ArrowDown: () => true }, { priority: 'navigation' });
		registry.registerKeymap({ 'Mod-B': () => true });

		registry.clear();

		const groups = registry.getKeymapsByPriority();
		expect(groups.context).toEqual([]);
		expect(groups.navigation).toEqual([]);
		expect(groups.default).toEqual([]);
		expect(registry.getKeymaps()).toEqual([]);
	});
});
