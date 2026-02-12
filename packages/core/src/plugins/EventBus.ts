/**
 * Standalone event bus with error isolation and type-safe event keys.
 * Each listener is wrapped in try/catch — a failing listener never affects others.
 */

import type { EventKey, PluginEventCallback } from './Plugin.js';

export class EventBus {
	private readonly listeners = new Map<string, Set<PluginEventCallback>>();

	/** Emits an event to all registered listeners. Errors are caught per listener. */
	emit<T>(key: EventKey<T>, payload: T): void {
		const set = this.listeners.get(key.id);
		if (!set) return;

		for (const listener of set) {
			try {
				listener(payload);
			} catch (err) {
				console.error(`[EventBus] Listener error on "${key.id}":`, err);
			}
		}
	}

	/** Subscribes to an event. Returns an unsubscribe function. */
	on<T>(key: EventKey<T>, callback: PluginEventCallback<T>): () => void {
		const id = key.id;
		if (!this.listeners.has(id)) {
			this.listeners.set(id, new Set());
		}
		const set = this.listeners.get(id) ?? new Set();
		set.add(callback as PluginEventCallback);

		return () => {
			set.delete(callback as PluginEventCallback);
			if (set.size === 0) this.listeners.delete(id);
		};
	}

	/** Removes a specific listener from an event. */
	off<T>(key: EventKey<T>, callback: PluginEventCallback<T>): void {
		const set = this.listeners.get(key.id);
		if (!set) return;
		set.delete(callback as PluginEventCallback);
		if (set.size === 0) this.listeners.delete(key.id);
	}

	/** Removes all listeners for all events. */
	clear(): void {
		this.listeners.clear();
	}
}
