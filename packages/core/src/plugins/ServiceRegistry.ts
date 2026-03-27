/**
 * Type-safe service registry for cross-plugin service sharing.
 * Extracted from PluginManager for single-responsibility.
 */

import type { ServiceKey } from './Plugin.js';

export class ServiceRegistry {
	private readonly services = new Map<string, unknown>();

	/** Registers a service. Throws if the key is already registered. */
	register<T>(key: ServiceKey<T>, service: T): void {
		if (this.services.has(key.id)) {
			throw new Error(`Service "${key.id}" is already registered.`);
		}
		this.services.set(key.id, service);
	}

	/** Returns a service by typed key, or undefined if not registered. */
	get<T>(key: ServiceKey<T>): T | undefined {
		return this.services.get(key.id) as T | undefined;
	}

	has(id: string): boolean {
		return this.services.has(id);
	}

	remove(id: string): void {
		this.services.delete(id);
	}

	clear(): void {
		this.services.clear();
	}

	/** Exposes internal map for ContextFactoryDeps assembly. */
	get rawMap(): Map<string, unknown> {
		return this.services;
	}
}
