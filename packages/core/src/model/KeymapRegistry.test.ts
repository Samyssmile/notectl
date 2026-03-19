import { describe, expect, it } from 'vitest';
import type { Keymap } from './Keymap.js';
import { KeymapRegistry } from './KeymapRegistry.js';

describe('KeymapRegistry', () => {
	it('allows multiple keymaps with the same shortcut at the same priority', () => {
		const registry = new KeymapRegistry();
		registry.registerKeymap({ 'Mod-B': () => true });
		registry.registerKeymap({ 'Mod-B': () => false });

		const groups = registry.getKeymapsByPriority();
		expect(groups.default).toHaveLength(2);
	});

	it('allows same shortcut across different priorities', () => {
		const registry = new KeymapRegistry();
		registry.registerKeymap({ Enter: () => true });
		registry.registerKeymap({ Enter: () => false }, { priority: 'context' });

		const groups = registry.getKeymapsByPriority();
		expect(groups.default).toHaveLength(1);
		expect(groups.context).toHaveLength(1);
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
