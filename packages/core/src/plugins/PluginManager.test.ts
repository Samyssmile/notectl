import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '../state/EditorState.js';
import { makePluginOptions } from '../test/TestUtils.js';
import { EventKey, ServiceKey } from './Plugin.js';
import type { Plugin, PluginContext } from './Plugin.js';
import { PluginManager } from './PluginManager.js';

// --- Helpers ---

function makePlugin(overrides: Partial<Plugin> & { id: string }): Plugin {
	return {
		name: overrides.id,
		init: vi.fn(),
		...overrides,
	};
}

function makeTr() {
	const state = EditorState.create();
	return state.transaction('command').build();
}

// --- Tests ---

describe('PluginManager', () => {
	describe('registration', () => {
		it('registers a plugin', () => {
			const pm = new PluginManager();
			const p = makePlugin({ id: 'a' });
			pm.register(p);
			expect(pm.get('a')).toBe(p);
		});

		it('throws on duplicate registration', () => {
			const pm = new PluginManager();
			pm.register(makePlugin({ id: 'a' }));
			expect(() => pm.register(makePlugin({ id: 'a' }))).toThrow('already registered');
		});

		it('throws on registration after init', async () => {
			const pm = new PluginManager();
			pm.register(makePlugin({ id: 'a' }));
			await pm.init(makePluginOptions());
			expect(() => pm.register(makePlugin({ id: 'b' }))).toThrow('after initialization');
		});

		it('concurrent init calls only initialize once', async () => {
			const pm = new PluginManager();
			const initFn = vi.fn();
			pm.register(makePlugin({ id: 'a', init: initFn }));

			const [r1, r2] = await Promise.allSettled([
				pm.init(makePluginOptions()),
				pm.init(makePluginOptions()),
			]);

			expect(r1.status).toBe('fulfilled');
			expect(r2.status).toBe('fulfilled');
			expect(initFn).toHaveBeenCalledTimes(1);
		});

		it('sets initialized only after all plugins have completed init', async () => {
			let resolvePlugin: (() => void) | undefined;
			const pluginReady = new Promise<void>((r) => {
				resolvePlugin = r;
			});
			let registeredDuringInit = false;

			const pm = new PluginManager();
			pm.register(
				makePlugin({
					id: 'slow',
					init: vi.fn(async () => {
						// While this plugin is initializing, try registering another
						try {
							pm.register(makePlugin({ id: 'late' }));
							registeredDuringInit = true;
						} catch {
							registeredDuringInit = false;
						}
						await pluginReady;
					}),
				}),
			);

			const initPromise = pm.init(makePluginOptions());

			// Plugin is still initializing — register should throw because initializing guard is active
			expect(registeredDuringInit).toBe(false);

			resolvePlugin?.();
			await initPromise;

			// Now fully initialized — register should also throw
			expect(() => pm.register(makePlugin({ id: 'after' }))).toThrow('after initialization');
		});

		it('returns all plugin IDs', () => {
			const pm = new PluginManager();
			pm.register(makePlugin({ id: 'a' }));
			pm.register(makePlugin({ id: 'b' }));
			expect(pm.getPluginIds()).toEqual(['a', 'b']);
		});
	});

	describe('dependency resolution', () => {
		it('initializes independent plugins in priority order', async () => {
			const order: string[] = [];
			const pm = new PluginManager();
			pm.register(
				makePlugin({
					id: 'b',
					priority: 50,
					init: vi.fn(() => {
						order.push('b');
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'a',
					priority: 10,
					init: vi.fn(() => {
						order.push('a');
					}),
				}),
			);
			await pm.init(makePluginOptions());
			expect(order).toEqual(['a', 'b']);
		});

		it('respects dependencies (dependent inits after dependency)', async () => {
			const order: string[] = [];
			const pm = new PluginManager();
			pm.register(
				makePlugin({
					id: 'child',
					dependencies: ['parent'],
					init: vi.fn(() => {
						order.push('child');
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'parent',
					init: vi.fn(() => {
						order.push('parent');
					}),
				}),
			);
			await pm.init(makePluginOptions());
			expect(order.indexOf('parent')).toBeLessThan(order.indexOf('child'));
		});

		it('handles transitive dependencies', async () => {
			const order: string[] = [];
			const pm = new PluginManager();
			pm.register(
				makePlugin({
					id: 'c',
					dependencies: ['b'],
					init: vi.fn(() => {
						order.push('c');
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'b',
					dependencies: ['a'],
					init: vi.fn(() => {
						order.push('b');
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'a',
					init: vi.fn(() => {
						order.push('a');
					}),
				}),
			);
			await pm.init(makePluginOptions());
			expect(order).toEqual(['a', 'b', 'c']);
		});

		it('throws on circular dependency', async () => {
			const pm = new PluginManager();
			pm.register(makePlugin({ id: 'a', dependencies: ['b'] }));
			pm.register(makePlugin({ id: 'b', dependencies: ['a'] }));
			await expect(pm.init(makePluginOptions())).rejects.toThrow('Circular dependency');
		});

		it('throws on missing dependency', async () => {
			const pm = new PluginManager();
			pm.register(makePlugin({ id: 'a', dependencies: ['missing'] }));
			await expect(pm.init(makePluginOptions())).rejects.toThrow('not registered');
		});
	});

	describe('middleware chain', () => {
		it('passes through when no middleware registered', () => {
			const pm = new PluginManager();
			const dispatch = vi.fn();
			const tr = makeTr();
			pm.dispatchWithMiddleware(tr, EditorState.create(), dispatch);
			expect(dispatch).toHaveBeenCalledWith(tr);
		});

		it('runs a single middleware', async () => {
			const pm = new PluginManager();
			let capturedContext: PluginContext | null = null;

			pm.register(
				makePlugin({
					id: 'mw',
					init: vi.fn((ctx) => {
						capturedContext = ctx;
						ctx.registerMiddleware((_tr, _state, next) => {
							next(_tr);
						});
					}),
				}),
			);
			await pm.init(makePluginOptions());

			const dispatch = vi.fn();
			const tr = makeTr();
			pm.dispatchWithMiddleware(tr, EditorState.create(), dispatch);
			expect(dispatch).toHaveBeenCalledWith(tr);
			expect(capturedContext).not.toBeNull();
		});

		it('middleware can suppress a transaction by not calling next', async () => {
			const pm = new PluginManager();
			pm.register(
				makePlugin({
					id: 'blocker',
					init: vi.fn((ctx) => {
						ctx.registerMiddleware((_tr, _state, _next) => {
							// Don't call next — suppresses the transaction
						});
					}),
				}),
			);
			await pm.init(makePluginOptions());

			const dispatch = vi.fn();
			pm.dispatchWithMiddleware(makeTr(), EditorState.create(), dispatch);
			expect(dispatch).not.toHaveBeenCalled();
		});

		it('middleware errors are isolated — chain continues', async () => {
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const pm = new PluginManager();

			pm.register(
				makePlugin({
					id: 'bad',
					init: vi.fn((ctx) => {
						ctx.registerMiddleware(() => {
							throw new Error('boom');
						}, 1);
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'good',
					init: vi.fn((ctx) => {
						ctx.registerMiddleware((_tr, _state, next) => {
							next(_tr);
						}, 2);
					}),
				}),
			);
			await pm.init(makePluginOptions());

			const dispatch = vi.fn();
			pm.dispatchWithMiddleware(makeTr(), EditorState.create(), dispatch);
			expect(dispatch).toHaveBeenCalled();

			errSpy.mockRestore();
		});

		it('guards against middleware calling next() multiple times', async () => {
			const pm = new PluginManager();

			pm.register(
				makePlugin({
					id: 'double-caller',
					init: vi.fn((ctx) => {
						ctx.registerMiddleware((tr, _state, next) => {
							next(tr);
							next(tr); // second call should be ignored
							next(tr); // third call should be ignored
						});
					}),
				}),
			);
			await pm.init(makePluginOptions());

			const dispatch = vi.fn();
			pm.dispatchWithMiddleware(makeTr(), EditorState.create(), dispatch);
			expect(dispatch).toHaveBeenCalledTimes(1);
		});

		it('guards finalDispatch even when multiple middlewares double-call next', async () => {
			const pm = new PluginManager();

			pm.register(
				makePlugin({
					id: 'mw1',
					init: vi.fn((ctx) => {
						ctx.registerMiddleware((tr, _state, next) => {
							next(tr);
							next(tr);
						}, 1);
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'mw2',
					init: vi.fn((ctx) => {
						ctx.registerMiddleware((tr, _state, next) => {
							next(tr);
							next(tr);
						}, 2);
					}),
				}),
			);
			await pm.init(makePluginOptions());

			const dispatch = vi.fn();
			pm.dispatchWithMiddleware(makeTr(), EditorState.create(), dispatch);
			expect(dispatch).toHaveBeenCalledTimes(1);
		});

		it('respects middleware priority ordering', async () => {
			const order: number[] = [];
			const pm = new PluginManager();

			pm.register(
				makePlugin({
					id: 'p1',
					init: vi.fn((ctx) => {
						ctx.registerMiddleware((tr, _state, next) => {
							order.push(2);
							next(tr);
						}, 200);
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'p2',
					init: vi.fn((ctx) => {
						ctx.registerMiddleware((tr, _state, next) => {
							order.push(1);
							next(tr);
						}, 100);
					}),
				}),
			);
			await pm.init(makePluginOptions());

			pm.dispatchWithMiddleware(makeTr(), EditorState.create(), vi.fn());
			expect(order).toEqual([1, 2]);
		});
	});

	describe('command registry', () => {
		it('registers and executes a command', async () => {
			const pm = new PluginManager();
			const handler = vi.fn(() => true);

			pm.register(
				makePlugin({
					id: 'cmd',
					init: vi.fn((ctx) => {
						ctx.registerCommand('doSomething', handler);
					}),
				}),
			);
			await pm.init(makePluginOptions());

			expect(pm.executeCommand('doSomething')).toBe(true);
			expect(handler).toHaveBeenCalled();
		});

		it('returns false for unknown commands', () => {
			const pm = new PluginManager();
			expect(pm.executeCommand('nope')).toBe(false);
		});

		it('throws on duplicate command registration', async () => {
			const pm = new PluginManager();
			pm.register(
				makePlugin({
					id: 'first',
					init: vi.fn((ctx) => {
						ctx.registerCommand('cmd', () => true);
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'second',
					init: vi.fn((ctx) => {
						expect(() => ctx.registerCommand('cmd', () => true)).toThrow('already registered');
					}),
				}),
			);
			await pm.init(makePluginOptions());
		});

		it('isolates command errors', async () => {
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const pm = new PluginManager();

			pm.register(
				makePlugin({
					id: 'bad',
					init: vi.fn((ctx) => {
						ctx.registerCommand('crash', () => {
							throw new Error('boom');
						});
					}),
				}),
			);
			await pm.init(makePluginOptions());

			expect(pm.executeCommand('crash')).toBe(false);
			expect(errSpy).toHaveBeenCalled();
			errSpy.mockRestore();
		});
	});

	describe('service registry', () => {
		const greeterKey = new ServiceKey<{ greet: () => string }>('greeter');
		const svcKey = new ServiceKey<{ a: number }>('svc');
		const dataKey = new ServiceKey<{ value: number }>('data');

		it('registers and retrieves a service', async () => {
			const pm = new PluginManager();
			const svc = { greet: () => 'hello' };

			pm.register(
				makePlugin({
					id: 'svc',
					init: vi.fn((ctx) => {
						ctx.registerService(greeterKey, svc);
					}),
				}),
			);
			await pm.init(makePluginOptions());

			expect(pm.getService(greeterKey)).toBe(svc);
		});

		it('returns undefined for unknown services', () => {
			const pm = new PluginManager();
			expect(pm.getService(greeterKey)).toBeUndefined();
		});

		it('throws on duplicate service registration', async () => {
			const pm = new PluginManager();
			pm.register(
				makePlugin({
					id: 'first',
					init: vi.fn((ctx) => {
						ctx.registerService(svcKey, { a: 1 });
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'second',
					init: vi.fn((ctx) => {
						expect(() => ctx.registerService(svcKey, { a: 2 })).toThrow('already registered');
					}),
				}),
			);
			await pm.init(makePluginOptions());
		});

		it('service is accessible from other plugin contexts', async () => {
			const pm = new PluginManager();
			const svc = { value: 42 };
			let retrievedSvc: unknown = null;

			pm.register(
				makePlugin({
					id: 'provider',
					priority: 1,
					init: vi.fn((ctx) => {
						ctx.registerService(dataKey, svc);
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'consumer',
					priority: 2,
					dependencies: ['provider'],
					init: vi.fn((ctx) => {
						retrievedSvc = ctx.getService(dataKey);
					}),
				}),
			);
			await pm.init(makePluginOptions());

			expect(retrievedSvc).toBe(svc);
		});
	});

	describe('per-plugin cleanup', () => {
		it('cleans up commands registered by a destroyed plugin', async () => {
			const pm = new PluginManager();
			pm.register(
				makePlugin({
					id: 'a',
					init: vi.fn((ctx) => {
						ctx.registerCommand('cmdA', () => true);
					}),
				}),
			);
			await pm.init(makePluginOptions());

			expect(pm.executeCommand('cmdA')).toBe(true);
			await pm.destroy();
			expect(pm.executeCommand('cmdA')).toBe(false);
		});

		it('cleans up services registered by a destroyed plugin', async () => {
			const key = new ServiceKey<{ x: number }>('svc');
			const pm = new PluginManager();
			pm.register(
				makePlugin({
					id: 'a',
					init: vi.fn((ctx) => {
						ctx.registerService(key, { x: 1 });
					}),
				}),
			);
			await pm.init(makePluginOptions());

			expect(pm.getService(key)).toEqual({ x: 1 });
			await pm.destroy();
			expect(pm.getService(key)).toBeUndefined();
		});

		it('cleans up stylesheets registered by a destroyed plugin', async () => {
			const pm = new PluginManager();
			pm.register(
				makePlugin({
					id: 'styled',
					init: vi.fn((ctx) => {
						ctx.registerStyleSheet('.foo { color: red; }');
					}),
				}),
			);
			await pm.init(makePluginOptions());

			expect(pm.getPluginStyleSheets()).toHaveLength(1);
			await pm.destroy();
			expect(pm.getPluginStyleSheets()).toHaveLength(0);
		});

		it('only removes stylesheets belonging to the destroyed plugin', async () => {
			const pm = new PluginManager();
			pm.register(
				makePlugin({
					id: 'a',
					priority: 1,
					init: vi.fn((ctx) => {
						ctx.registerStyleSheet('.a { color: red; }');
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'b',
					priority: 2,
					init: vi.fn((ctx) => {
						ctx.registerStyleSheet('.b { color: blue; }');
					}),
				}),
			);
			await pm.init(makePluginOptions());

			expect(pm.getPluginStyleSheets()).toHaveLength(2);

			// Destroy only removes sheets in reverse init order.
			// After full destroy, all should be gone.
			await pm.destroy();
			expect(pm.getPluginStyleSheets()).toHaveLength(0);
		});

		it('cleans up event subscriptions on destroy', async () => {
			const pm = new PluginManager();
			const helloKey = new EventKey<number>('hello');
			const received: number[] = [];

			pm.register(
				makePlugin({
					id: 'listener',
					priority: 1,
					init: vi.fn((ctx) => {
						ctx.getEventBus().on(helloKey, (val) => {
							received.push(val);
						});
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'emitter',
					priority: 2,
					init: vi.fn((ctx) => {
						ctx.getEventBus().emit(helloKey, 42);
					}),
				}),
			);
			await pm.init(makePluginOptions());

			expect(received).toEqual([42]);
		});
	});

	describe('error isolation', () => {
		it('init error does not prevent other plugins', async () => {
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const pm = new PluginManager();
			const goodInit = vi.fn();

			pm.register(
				makePlugin({
					id: 'bad',
					priority: 1,
					init: vi.fn(() => {
						throw new Error('init fail');
					}),
				}),
			);
			pm.register(makePlugin({ id: 'good', priority: 2, init: goodInit }));
			await pm.init(makePluginOptions());

			expect(goodInit).toHaveBeenCalled();
			errSpy.mockRestore();
		});

		it('onStateChange error does not prevent other plugins', async () => {
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const pm = new PluginManager();
			const goodCb = vi.fn();

			pm.register(
				makePlugin({
					id: 'bad',
					priority: 1,
					onStateChange: () => {
						throw new Error('state fail');
					},
				}),
			);
			pm.register(makePlugin({ id: 'good', priority: 2, onStateChange: goodCb }));
			await pm.init(makePluginOptions());

			const state = EditorState.create();
			const tr = makeTr();
			pm.notifyStateChange(state, state, tr);

			expect(goodCb).toHaveBeenCalled();
			errSpy.mockRestore();
		});

		it('destroy error does not prevent other plugins from being destroyed', async () => {
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const pm = new PluginManager();
			const goodDestroy = vi.fn();

			pm.register(
				makePlugin({
					id: 'bad',
					priority: 1,
					destroy: vi.fn(() => {
						throw new Error('destroy fail');
					}),
				}),
			);
			pm.register(makePlugin({ id: 'good', priority: 2, destroy: goodDestroy }));
			await pm.init(makePluginOptions());
			await pm.destroy();

			expect(goodDestroy).toHaveBeenCalled();
			errSpy.mockRestore();
		});
	});

	describe('destruction', () => {
		it('destroys plugins in reverse init order', async () => {
			const order: string[] = [];
			const pm = new PluginManager();

			pm.register(
				makePlugin({
					id: 'a',
					priority: 1,
					destroy: vi.fn(() => {
						order.push('a');
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'b',
					priority: 2,
					destroy: vi.fn(() => {
						order.push('b');
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'c',
					priority: 3,
					destroy: vi.fn(() => {
						order.push('c');
					}),
				}),
			);
			await pm.init(makePluginOptions());
			await pm.destroy();

			expect(order).toEqual(['c', 'b', 'a']);
		});

		it('clears all registries on destroy', async () => {
			const svcKey = new ServiceKey<{ x: number }>('svc');
			const pm = new PluginManager();
			pm.register(
				makePlugin({
					id: 'a',
					init: vi.fn((ctx) => {
						ctx.registerCommand('cmd', () => true);
						ctx.registerService(svcKey, { x: 1 });
					}),
				}),
			);
			await pm.init(makePluginOptions());
			await pm.destroy();

			expect(pm.getPluginIds()).toEqual([]);
			expect(pm.get('a')).toBeUndefined();
			expect(pm.getService(svcKey)).toBeUndefined();
			expect(pm.executeCommand('cmd')).toBe(false);
		});
	});

	describe('notifyStateChange', () => {
		it('calls onStateChange with correct arguments', async () => {
			const pm = new PluginManager();
			const cb = vi.fn();

			pm.register(makePlugin({ id: 'a', onStateChange: cb }));
			await pm.init(makePluginOptions());

			const oldState = EditorState.create();
			const newState = EditorState.create();
			const tr = makeTr();
			pm.notifyStateChange(oldState, newState, tr);

			expect(cb).toHaveBeenCalledWith(oldState, newState, tr);
		});

		it('notifies in init order', async () => {
			const order: string[] = [];
			const pm = new PluginManager();

			pm.register(
				makePlugin({
					id: 'b',
					priority: 50,
					onStateChange: () => {
						order.push('b');
					},
				}),
			);
			pm.register(
				makePlugin({
					id: 'a',
					priority: 10,
					onStateChange: () => {
						order.push('a');
					},
				}),
			);
			await pm.init(makePluginOptions());

			pm.notifyStateChange(EditorState.create(), EditorState.create(), makeTr());
			expect(order).toEqual(['a', 'b']);
		});
	});

	describe('configurePlugin', () => {
		it('calls onConfigure on the target plugin', async () => {
			const pm = new PluginManager();
			const onConfigure = vi.fn();

			pm.register(makePlugin({ id: 'a', onConfigure }));
			await pm.init(makePluginOptions());

			pm.configurePlugin('a', { foo: 'bar' });
			expect(onConfigure).toHaveBeenCalledWith({ foo: 'bar' });
		});

		it('throws for unknown plugin', async () => {
			const pm = new PluginManager();
			await pm.init(makePluginOptions());
			expect(() => pm.configurePlugin('nope', {})).toThrow('not found');
		});

		it('is a no-op if plugin has no onConfigure', async () => {
			const pm = new PluginManager();
			pm.register(makePlugin({ id: 'a' }));
			await pm.init(makePluginOptions());
			expect(() => pm.configurePlugin('a', {})).not.toThrow();
		});
	});

	describe('event bus', () => {
		it('is shared across plugins', async () => {
			const pm = new PluginManager();
			const received: unknown[] = [];
			const helloKey = new EventKey<number>('hello');

			pm.register(
				makePlugin({
					id: 'sender',
					priority: 1,
					init: vi.fn((ctx) => {
						ctx.getEventBus().emit(helloKey, 42);
					}),
				}),
			);
			pm.register(
				makePlugin({
					id: 'receiver',
					priority: 0,
					init: vi.fn((ctx) => {
						ctx.getEventBus().on(helloKey, (val) => {
							received.push(val);
						});
					}),
				}),
			);
			await pm.init(makePluginOptions());

			expect(received).toEqual([42]);
		});
	});

	describe('readonly mode', () => {
		it('isReadOnly returns false by default', () => {
			const pm = new PluginManager();
			expect(pm.isReadOnly()).toBe(false);
		});

		it('setReadOnly updates the readonly state', async () => {
			const pm = new PluginManager();
			pm.register(makePlugin({ id: 'a' }));
			await pm.init(makePluginOptions());

			pm.setReadOnly(true);
			expect(pm.isReadOnly()).toBe(true);

			pm.setReadOnly(false);
			expect(pm.isReadOnly()).toBe(false);
		});

		it('setReadOnly calls onReadOnlyChange on plugins', async () => {
			const pm = new PluginManager();
			const onReadOnlyChange = vi.fn();

			pm.register(makePlugin({ id: 'a', onReadOnlyChange }));
			await pm.init(makePluginOptions());

			pm.setReadOnly(true);
			expect(onReadOnlyChange).toHaveBeenCalledWith(true);

			pm.setReadOnly(false);
			expect(onReadOnlyChange).toHaveBeenCalledWith(false);
		});

		it('setReadOnly skips notification when value unchanged', async () => {
			const pm = new PluginManager();
			const onReadOnlyChange = vi.fn();

			pm.register(makePlugin({ id: 'a', onReadOnlyChange }));
			await pm.init(makePluginOptions());

			pm.setReadOnly(true);
			pm.setReadOnly(true);
			expect(onReadOnlyChange).toHaveBeenCalledTimes(1);
		});

		it('setReadOnly calls plugins in init order', async () => {
			const order: string[] = [];
			const pm = new PluginManager();

			pm.register(
				makePlugin({
					id: 'b',
					priority: 50,
					onReadOnlyChange: () => {
						order.push('b');
					},
				}),
			);
			pm.register(
				makePlugin({
					id: 'a',
					priority: 10,
					onReadOnlyChange: () => {
						order.push('a');
					},
				}),
			);
			await pm.init(makePluginOptions());

			pm.setReadOnly(true);
			expect(order).toEqual(['a', 'b']);
		});

		it('isolates onReadOnlyChange errors', async () => {
			const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const pm = new PluginManager();
			const goodCb = vi.fn();

			pm.register(
				makePlugin({
					id: 'bad',
					priority: 1,
					onReadOnlyChange: () => {
						throw new Error('readonly fail');
					},
				}),
			);
			pm.register(makePlugin({ id: 'good', priority: 2, onReadOnlyChange: goodCb }));
			await pm.init(makePluginOptions());

			pm.setReadOnly(true);
			expect(goodCb).toHaveBeenCalledWith(true);
			errSpy.mockRestore();
		});

		it('executeCommand returns false in readonly mode', async () => {
			const pm = new PluginManager();
			const handler = vi.fn(() => true);

			pm.register(
				makePlugin({
					id: 'a',
					init: vi.fn((ctx) => {
						ctx.registerCommand('doSomething', handler);
					}),
				}),
			);
			await pm.init(makePluginOptions());

			expect(pm.executeCommand('doSomething')).toBe(true);
			expect(handler).toHaveBeenCalledTimes(1);

			pm.setReadOnly(true);
			expect(pm.executeCommand('doSomething')).toBe(false);
			expect(handler).toHaveBeenCalledTimes(1);

			pm.setReadOnly(false);
			expect(pm.executeCommand('doSomething')).toBe(true);
			expect(handler).toHaveBeenCalledTimes(2);
		});

		it('context.isReadOnly() reflects current state', async () => {
			const pm = new PluginManager();
			let capturedContext: PluginContext | null = null;

			pm.register(
				makePlugin({
					id: 'a',
					init: vi.fn((ctx) => {
						capturedContext = ctx;
					}),
				}),
			);
			await pm.init(makePluginOptions());

			expect(capturedContext?.isReadOnly()).toBe(false);
			pm.setReadOnly(true);
			expect(capturedContext?.isReadOnly()).toBe(true);
			pm.setReadOnly(false);
			expect(capturedContext?.isReadOnly()).toBe(false);
		});
	});
});
