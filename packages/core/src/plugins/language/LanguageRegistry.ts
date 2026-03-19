/**
 * Internal registry that stores LanguageSupport bundles and notifies
 * subscribers with replay semantics for late subscribers.
 */

import type {
	LanguageRegistryListener,
	LanguageRegistryService,
	LanguageSupport,
} from './LanguageTypes.js';

export class LanguageRegistry implements LanguageRegistryService {
	private readonly bundles = new Map<string, LanguageSupport>();
	private readonly listeners: LanguageRegistryListener[] = [];

	register(support: LanguageSupport): void {
		this.bundles.set(support.id, support);
		for (const listener of this.listeners) {
			listener(support);
		}
	}

	/**
	 * Subscribes to language registrations.
	 * The listener is immediately called for all already-registered bundles
	 * (replay semantics), then called for each future registration.
	 */
	onRegister(listener: LanguageRegistryListener): void {
		this.listeners.push(listener);
		for (const support of this.bundles.values()) {
			listener(support);
		}
	}

	get(id: string): LanguageSupport | undefined {
		return this.bundles.get(id);
	}

	getAll(): readonly LanguageSupport[] {
		return [...this.bundles.values()];
	}
}
