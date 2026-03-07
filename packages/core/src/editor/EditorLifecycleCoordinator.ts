/**
 * Manages editor lifecycle state: initialization flag, ready promise, and pre-init plugins.
 *
 * Pure state machine with no DOM or external dependencies.
 */

import type { Plugin } from '../plugins/Plugin.js';

type LifecycleState = 'idle' | 'initializing' | 'ready' | 'failed';

export class EditorLifecycleCoordinator {
	private state: LifecycleState = 'idle';
	private readyPromiseResolve: (() => void) | null = null;
	private readyPromiseReject: ((reason?: unknown) => void) | null = null;
	private readyPromise: Promise<void>;
	private preInitPlugins: Plugin[] = [];

	constructor() {
		this.readyPromise = this.createReadyPromise();
	}

	/** Returns whether the editor has been initialized. */
	isInitialized(): boolean {
		return this.state === 'initializing' || this.state === 'ready';
	}

	/** Marks the editor as initialized. Returns false if already initialized. */
	markInitialized(): boolean {
		if (this.state === 'initializing' || this.state === 'ready') return false;
		if (this.state === 'failed') {
			this.readyPromise = this.createReadyPromise();
		}
		this.state = 'initializing';
		return true;
	}

	/** Returns a promise that resolves when the editor is ready. */
	whenReady(): Promise<void> {
		return this.readyPromise;
	}

	/** Resolves the ready promise. */
	resolveReady(): void {
		if (this.state !== 'initializing') return;
		this.state = 'ready';
		this.readyPromiseResolve?.();
		this.readyPromiseResolve = null;
		this.readyPromiseReject = null;
	}

	/** Rejects the current ready promise and allows a later retry. */
	failReady(reason: unknown): void {
		if (this.state !== 'initializing') return;
		this.state = 'failed';
		this.readyPromiseReject?.(reason);
		this.readyPromiseResolve = null;
		this.readyPromiseReject = null;
	}

	/** Registers a plugin before initialization. Throws if already initialized. */
	registerPreInitPlugin(plugin: Plugin): void {
		if (this.state === 'initializing' || this.state === 'ready') {
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

	/** Restores previously consumed pre-init plugins for a retry attempt. */
	restorePreInitPlugins(plugins: readonly Plugin[]): void {
		if (plugins.length === 0) return;
		this.preInitPlugins = [...plugins, ...this.preInitPlugins];
	}

	/** Resets all lifecycle state, including a fresh ready promise. */
	reset(): void {
		this.state = 'idle';
		this.preInitPlugins = [];
		this.readyPromise = this.createReadyPromise();
	}

	private createReadyPromise(): Promise<void> {
		const readyPromise = new Promise<void>((resolve, reject) => {
			this.readyPromiseResolve = resolve;
			this.readyPromiseReject = reject;
		});
		// Suppress unhandled rejection noise when init fails before a caller awaits whenReady().
		void readyPromise.catch(() => undefined);
		return readyPromise;
	}
}
