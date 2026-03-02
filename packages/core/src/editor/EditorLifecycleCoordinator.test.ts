import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from '../plugins/Plugin.js';
import { EditorLifecycleCoordinator } from './EditorLifecycleCoordinator.js';

function stubPlugin(id: string): Plugin {
	return { id, init: vi.fn() };
}

describe('EditorLifecycleCoordinator', () => {
	it('starts as not initialized', () => {
		const lc = new EditorLifecycleCoordinator();
		expect(lc.isInitialized()).toBe(false);
	});

	it('markInitialized returns true on first call', () => {
		const lc = new EditorLifecycleCoordinator();
		expect(lc.markInitialized()).toBe(true);
		expect(lc.isInitialized()).toBe(true);
	});

	it('markInitialized returns false on second call', () => {
		const lc = new EditorLifecycleCoordinator();
		lc.markInitialized();
		expect(lc.markInitialized()).toBe(false);
	});

	it('resolveReady resolves the whenReady promise', async () => {
		const lc = new EditorLifecycleCoordinator();
		const spy = vi.fn();
		const promise = lc.whenReady().then(spy);

		lc.resolveReady();
		await promise;

		expect(spy).toHaveBeenCalledOnce();
	});

	it('registerPreInitPlugin stores plugins', () => {
		const lc = new EditorLifecycleCoordinator();
		const p1: Plugin = stubPlugin('a');
		const p2: Plugin = stubPlugin('b');

		lc.registerPreInitPlugin(p1);
		lc.registerPreInitPlugin(p2);

		const consumed: Plugin[] = lc.consumePreInitPlugins();
		expect(consumed).toEqual([p1, p2]);
	});

	it('consumePreInitPlugins clears the list', () => {
		const lc = new EditorLifecycleCoordinator();
		lc.registerPreInitPlugin(stubPlugin('a'));
		lc.consumePreInitPlugins();

		expect(lc.consumePreInitPlugins()).toHaveLength(0);
	});

	it('registerPreInitPlugin throws after initialization', () => {
		const lc = new EditorLifecycleCoordinator();
		lc.markInitialized();

		expect(() => lc.registerPreInitPlugin(stubPlugin('a'))).toThrow(
			'Cannot register plugins after initialization',
		);
	});

	it('reset restores to initial state', () => {
		const lc = new EditorLifecycleCoordinator();
		lc.registerPreInitPlugin(stubPlugin('a'));
		lc.markInitialized();

		lc.reset();

		expect(lc.isInitialized()).toBe(false);
		expect(lc.consumePreInitPlugins()).toHaveLength(0);
	});

	it('allows registerPreInitPlugin after reset', () => {
		const lc = new EditorLifecycleCoordinator();
		lc.markInitialized();
		lc.reset();

		const plugin: Plugin = stubPlugin('a');
		lc.registerPreInitPlugin(plugin);

		expect(lc.consumePreInitPlugins()).toEqual([plugin]);
	});

	it('reset creates a fresh unresolved ready promise', async () => {
		const lc = new EditorLifecycleCoordinator();
		lc.resolveReady();
		await lc.whenReady();

		lc.reset();

		let resolved = false;
		lc.whenReady().then(() => {
			resolved = true;
		});
		// Flush microtasks
		await Promise.resolve();
		expect(resolved).toBe(false);

		lc.resolveReady();
		await lc.whenReady();
		expect(resolved).toBe(true);
	});
});
