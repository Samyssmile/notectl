/**
 * Typed event emitter for the editor component.
 *
 * Extracted from NotectlEditor to keep the Web Component shell thin.
 * Provides type-safe on/off/emit for a fixed EventMap.
 */

import { type Logger, consoleLogger } from '../plugins/Logger.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';

export interface StateChangeEvent {
	oldState: EditorState;
	newState: EditorState;
	transaction: Transaction;
}

export type EditorEventMap = {
	stateChange: StateChangeEvent;
	selectionChange: { selection: import('../model/Selection.js').EditorSelection };
	focus: undefined;
	blur: undefined;
	ready: undefined;
};

type EventCallback<T> = (payload: T) => unknown;

export class EditorEventEmitter {
	private readonly listeners: Map<string, Set<EventCallback<unknown>>> = new Map();
	private log: Logger;

	constructor(logger: Logger = consoleLogger) {
		this.log = logger;
	}

	/** Replaces the error sink used for consumer-listener failures. */
	setLogger(logger: Logger = consoleLogger): void {
		this.log = logger;
	}

	/** Registers an event listener. */
	on<K extends keyof EditorEventMap>(event: K, callback: EventCallback<EditorEventMap[K]>): void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)?.add(callback as EventCallback<unknown>);
	}

	/** Removes an event listener. */
	off<K extends keyof EditorEventMap>(event: K, callback: EventCallback<EditorEventMap[K]>): void {
		this.listeners.get(event)?.delete(callback as EventCallback<unknown>);
	}

	/** Emits an event to all listeners, isolating failures per consumer callback. */
	emit<K extends keyof EditorEventMap>(event: K, payload: EditorEventMap[K]): void {
		const set: Set<EventCallback<unknown>> | undefined = this.listeners.get(event);
		if (!set) return;
		const logger: Logger = this.log;

		for (const cb of set) {
			try {
				const result: unknown = (cb as EventCallback<EditorEventMap[K]>)(payload);
				this.observeListenerResult(logger, event, result);
			} catch (error) {
				this.reportListenerError(logger, event, error);
			}
		}
	}

	/** Observes promise-like callback results without trusting their `then` implementation. */
	private observeListenerResult(
		logger: Logger,
		event: keyof EditorEventMap,
		result: unknown,
	): void {
		if (result === null || (typeof result !== 'object' && typeof result !== 'function')) {
			return;
		}

		// Promise.resolve performs the platform thenable-assimilation algorithm: a
		// throwing `then` accessor/call becomes a rejection instead of escaping this
		// synchronous event boundary. The rejection handler itself never throws.
		void Promise.resolve(result).then(undefined, (error: unknown) => {
			this.reportListenerError(logger, event, error);
		});
	}

	private reportListenerError(logger: Logger, event: keyof EditorEventMap, error: unknown): void {
		// Logging is an application-supplied callback too. Its own failure must
		// not reopen the event boundary or create a secondary rejected promise.
		try {
			const result: unknown = logger.error(
				`[EditorEventEmitter] Listener error on "${String(event)}"`,
				error,
			);
			if (result !== null && (typeof result === 'object' || typeof result === 'function')) {
				void Promise.resolve(result).then(undefined, () => undefined);
			}
		} catch {
			// Reporting is best-effort; event delivery remains authoritative.
		}
	}

	/** Removes all listeners. */
	clear(): void {
		this.listeners.clear();
	}
}
