import { describe, expect, it, vi } from 'vitest';
import type { EditorState } from '../state/EditorState.js';
import type { Plugin, PluginContext } from './Plugin.js';
import { PluginLifecycle } from './PluginLifecycle.js';
import type { PluginLifecycleInitOptions } from './PluginLifecycle.js';
import type { RegistrationTracker } from './RegistrationTracker.js';

function makeTracker(): RegistrationTracker {
	return { cleanup: vi.fn(), clear: vi.fn() } as unknown as RegistrationTracker;
}

function makePlugin(id: string, overrides?: Partial<Plugin>): Plugin {
	return { id, name: id, init: vi.fn(), ...overrides };
}

function makeOptions(): PluginLifecycleInitOptions {
	return {
		getState: () => ({}) as EditorState,
		dispatch: vi.fn(),
		getContainer: () => document.createElement('div'),
		getPluginContainer: () => document.createElement('div'),
	};
}

function makeContext(): PluginContext {
	return {} as unknown as PluginContext;
}

describe('PluginLifecycle', () => {
	describe('registration', () => {
		it('registers and retrieves a plugin', () => {
			const lc = new PluginLifecycle(makeTracker());
			const plugin = makePlugin('bold');
			lc.register(plugin);
			expect(lc.get('bold')).toBe(plugin);
		});

		it('throws on duplicate registration', () => {
			const lc = new PluginLifecycle(makeTracker());
			lc.register(makePlugin('bold'));
			expect(() => lc.register(makePlugin('bold'))).toThrow('already registered');
		});

		it('returns all plugin IDs', () => {
			const lc = new PluginLifecycle(makeTracker());
			lc.register(makePlugin('a'));
			lc.register(makePlugin('b'));
			expect(lc.getPluginIds()).toEqual(['a', 'b']);
		});
	});

	describe('initialization', () => {
		it('initializes plugins in priority order', async () => {
			const lc = new PluginLifecycle(makeTracker());
			const order: string[] = [];
			lc.register(
				makePlugin('low', {
					priority: 200,
					init: vi.fn(() => {
						order.push('low');
					}),
				}),
			);
			lc.register(
				makePlugin('high', {
					priority: 10,
					init: vi.fn(() => {
						order.push('high');
					}),
				}),
			);

			await lc.init(makeOptions(), () => makeContext());
			expect(order).toEqual(['high', 'low']);
		});

		it('respects dependencies', async () => {
			const lc = new PluginLifecycle(makeTracker());
			const order: string[] = [];
			lc.register(
				makePlugin('child', {
					dependencies: ['parent'],
					init: vi.fn(() => {
						order.push('child');
					}),
				}),
			);
			lc.register(
				makePlugin('parent', {
					init: vi.fn(() => {
						order.push('parent');
					}),
				}),
			);

			await lc.init(makeOptions(), () => makeContext());
			expect(order).toEqual(['parent', 'child']);
		});

		it('throws on circular dependency', async () => {
			const lc = new PluginLifecycle(makeTracker());
			lc.register(makePlugin('a', { dependencies: ['b'] }));
			lc.register(makePlugin('b', { dependencies: ['a'] }));

			await expect(lc.init(makeOptions(), () => makeContext())).rejects.toThrow(
				'Circular dependency',
			);
		});

		it('throws on missing dependency', async () => {
			const lc = new PluginLifecycle(makeTracker());
			lc.register(makePlugin('a', { dependencies: ['missing'] }));

			await expect(lc.init(makeOptions(), () => makeContext())).rejects.toThrow('not registered');
		});

		it('rolls back on init error', async () => {
			const tracker = makeTracker();
			const lc = new PluginLifecycle(tracker);
			const destroy = vi.fn();
			lc.register(makePlugin('ok', { priority: 10, destroy }));
			lc.register(
				makePlugin('bad', {
					priority: 20,
					init: () => {
						throw new Error('fail');
					},
				}),
			);

			await expect(lc.init(makeOptions(), () => makeContext())).rejects.toThrow('fail');
			expect(destroy).toHaveBeenCalledOnce();
			expect(tracker.cleanup).toHaveBeenCalledWith('ok');
		});
	});

	describe('destruction', () => {
		it('destroys in reverse init order', async () => {
			const lc = new PluginLifecycle(makeTracker());
			const order: string[] = [];
			lc.register(
				makePlugin('a', {
					priority: 10,
					destroy: () => {
						order.push('a');
					},
				}),
			);
			lc.register(
				makePlugin('b', {
					priority: 20,
					destroy: () => {
						order.push('b');
					},
				}),
			);

			await lc.init(makeOptions(), () => makeContext());
			await lc.destroy();
			expect(order).toEqual(['b', 'a']);
		});
	});

	describe('read-only', () => {
		it('defaults to false', () => {
			const lc = new PluginLifecycle(makeTracker());
			expect(lc.isReadOnly()).toBe(false);
		});

		it('notifies plugins on change', async () => {
			const lc = new PluginLifecycle(makeTracker());
			const onReadOnlyChange = vi.fn();
			lc.register(makePlugin('a', { onReadOnlyChange }));
			await lc.init(makeOptions(), () => makeContext());

			lc.setReadOnly(true);
			expect(lc.isReadOnly()).toBe(true);
			expect(onReadOnlyChange).toHaveBeenCalledWith(true);
		});

		it('skips notification when value unchanged', async () => {
			const lc = new PluginLifecycle(makeTracker());
			const onReadOnlyChange = vi.fn();
			lc.register(makePlugin('a', { onReadOnlyChange }));
			await lc.init(makeOptions(), () => makeContext());

			lc.setReadOnly(false);
			expect(onReadOnlyChange).not.toHaveBeenCalled();
		});
	});

	describe('notifications', () => {
		it('notifies state change in init order', async () => {
			const lc = new PluginLifecycle(makeTracker());
			const order: string[] = [];
			lc.register(
				makePlugin('a', {
					priority: 10,
					onStateChange: () => order.push('a'),
				}),
			);
			lc.register(
				makePlugin('b', {
					priority: 20,
					onStateChange: () => order.push('b'),
				}),
			);

			await lc.init(makeOptions(), () => makeContext());
			const state = {} as EditorState;
			const tr = { steps: [], origin: 'command' } as never;
			lc.notifyStateChange(state, state, tr);
			expect(order).toEqual(['a', 'b']);
		});

		it('isolates errors in onStateChange', async () => {
			const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const lc = new PluginLifecycle(makeTracker());
			const callback = vi.fn();
			lc.register(
				makePlugin('bad', {
					priority: 10,
					onStateChange: () => {
						throw new Error('boom');
					},
				}),
			);
			lc.register(makePlugin('good', { priority: 20, onStateChange: callback }));

			await lc.init(makeOptions(), () => makeContext());
			const state = {} as EditorState;
			const tr = { steps: [], origin: 'command' } as never;
			lc.notifyStateChange(state, state, tr);
			expect(callback).toHaveBeenCalledOnce();
			spy.mockRestore();
		});
	});

	describe('configurePlugin', () => {
		it('calls onConfigure on target plugin', async () => {
			const lc = new PluginLifecycle(makeTracker());
			const onConfigure = vi.fn();
			lc.register(makePlugin('a', { onConfigure }));
			await lc.init(makeOptions(), () => makeContext());

			lc.configurePlugin('a', { theme: 'dark' });
			expect(onConfigure).toHaveBeenCalledWith({ theme: 'dark' });
		});

		it('throws for unknown plugin', () => {
			const lc = new PluginLifecycle(makeTracker());
			expect(() => lc.configurePlugin('missing', {})).toThrow('not found');
		});
	});
});
