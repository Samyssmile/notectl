/**
 * Manages editor lifecycle state: initialization flag, ready promise, and pre-init plugins.
 *
 * Pure state machine with no DOM or external dependencies.
 */

import type { Plugin } from '../plugins/Plugin.js';

export class EditorLifecycleCoordinator {
	private initialized = false;
	private readyPromiseResolve: (() => void) | null = null;
	private readyPromise: Promise<void>;
	private preInitPlugins: Plugin[] = [];

	constructor() {
		this.readyPromise = this.createReadyPromise();
	}

	/** Returns whether the editor has been initialized. */
	isInitialized(): boolean {
		return this.initialized;
	}

	/** Marks the editor as initialized. Returns false if already initialized. */
	markInitialized(): boolean {
		if (this.initialized) return false;
		this.initialized = true;
		return true;
	}

	/** Returns a promise that resolves when the editor is ready. */
	whenReady(): Promise<void> {
		return this.readyPromise;
	}

	/** Resolves the ready promise. */
	resolveReady(): void {
		this.readyPromiseResolve?.();
	}

	/** Registers a plugin before initialization. Throws if already initialized. */
	registerPreInitPlugin(plugin: Plugin): void {
		if (this.initialized) {
			throw new Error(
				'Cannot register plugins after initialization. Register before calling init() or adding to DOM.',
			);
		}
		this.preInitPlugins.push(plugin);
	}

	/** Returns and clears the pre-init plugins list. */
	consumePreInitPlugins(): Plugin[] {
		const plugins: Plugin[] = this.preInitPlugins;
		this.preInitPlugins = [];
		return plugins;
	}

	/** Resets all lifecycle state, including a fresh ready promise. */
	reset(): void {
		this.initialized = false;
		this.preInitPlugins = [];
		this.readyPromise = this.createReadyPromise();
	}

	private createReadyPromise(): Promise<void> {
		return new Promise((resolve) => {
			this.readyPromiseResolve = resolve;
		});
	}
}
