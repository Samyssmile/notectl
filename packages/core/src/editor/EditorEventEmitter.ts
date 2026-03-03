/**
 * Typed event emitter for the editor component.
 *
 * Extracted from NotectlEditor to keep the Web Component shell thin.
 * Provides type-safe on/off/emit for a fixed EventMap.
 */

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

type EventCallback<T> = (payload: T) => void;

export class EditorEventEmitter {
	private readonly listeners: Map<string, Set<EventCallback<unknown>>> = new Map();

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

	/** Emits an event to all registered listeners. */
	emit<K extends keyof EditorEventMap>(event: K, payload: EditorEventMap[K]): void {
		const set: Set<EventCallback<unknown>> | undefined = this.listeners.get(event);
		if (!set) return;

		for (const cb of set) {
			(cb as EventCallback<EditorEventMap[K]>)(payload);
		}
	}

	/** Removes all listeners. */
	clear(): void {
		this.listeners.clear();
	}
}
