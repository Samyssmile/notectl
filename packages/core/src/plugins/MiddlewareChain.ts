/**
 * Manages middleware and paste interceptor chains with priority-based
 * sorting, cached ordering, and error-isolated dispatch.
 * Extracted from PluginManager for single-responsibility.
 */

import type { PasteInterceptorEntry } from '../model/PasteInterceptor.js';
import type { EditorState } from '../state/EditorState.js';
import type { Transaction } from '../state/Transaction.js';
import { type Logger, consoleLogger, scopedLogger } from './Logger.js';
import type { MiddlewareNext } from './Plugin.js';
import type { MiddlewareEntry } from './PluginContextFactory.js';

/** Describes a registered middleware for introspection. */
export interface MiddlewareInfo {
	readonly name: string;
	readonly priority: number;
	readonly pluginId: string;
}

export class MiddlewareChain {
	private readonly middlewares: MiddlewareEntry[] = [];
	private middlewareSorted: MiddlewareEntry[] | null = null;
	private readonly pasteInterceptors: PasteInterceptorEntry[] = [];
	private pasteInterceptorsSorted: PasteInterceptorEntry[] | null = null;
	private readonly log: Logger;

	constructor(logger: Logger = consoleLogger) {
		this.log = scopedLogger(logger, 'MiddlewareChain');
	}

	// --- Middleware ---

	addMiddleware(entry: MiddlewareEntry): void {
		this.middlewares.push(entry);
		this.middlewareSorted = null;
	}

	removeMiddleware(entry: MiddlewareEntry): void {
		const idx = this.middlewares.indexOf(entry);
		if (idx !== -1) this.middlewares.splice(idx, 1);
		this.middlewareSorted = null;
	}

	/** Invalidates the sorted middleware cache (used by PluginContextFactory). */
	invalidateMiddlewareSort(): void {
		this.middlewareSorted = null;
	}

	/**
	 * Dispatches a transaction through the middleware chain, then calls finalDispatch.
	 * If no middleware is registered, calls finalDispatch directly.
	 */
	dispatch(tr: Transaction, state: EditorState, finalDispatch: (tr: Transaction) => void): void {
		if (this.middlewares.length === 0) {
			finalDispatch(tr);
			return;
		}

		const sorted = this.getSortedMiddleware();
		let index = 0;
		let dispatched = false;

		const next: MiddlewareNext = (currentTr) => {
			if (index < sorted.length) {
				const entry = sorted[index++];
				if (!entry) return;
				let called = false;
				const guardedNext: MiddlewareNext = (nextTr) => {
					if (called) return;
					called = true;
					next(nextTr);
				};
				try {
					entry.middleware(currentTr, state, guardedNext);
				} catch (err) {
					this.log.error(`Middleware "${entry.name}" error`, err);
					guardedNext(currentTr);
				}
			} else if (!dispatched) {
				dispatched = true;
				finalDispatch(currentTr);
			}
		};

		next(tr);
	}

	/** Returns the middleware chain in execution order, for introspection. */
	getChain(): readonly MiddlewareInfo[] {
		return this.getSortedMiddleware().map((entry) => ({
			name: entry.name,
			priority: entry.priority,
			pluginId: entry.pluginId,
		}));
	}

	// --- Paste Interceptors ---

	addPasteInterceptor(entry: PasteInterceptorEntry): void {
		this.pasteInterceptors.push(entry);
		this.pasteInterceptorsSorted = null;
	}

	removePasteInterceptor(entry: PasteInterceptorEntry): void {
		const idx = this.pasteInterceptors.indexOf(entry);
		if (idx !== -1) this.pasteInterceptors.splice(idx, 1);
		this.pasteInterceptorsSorted = null;
	}

	/** Invalidates the sorted paste interceptor cache (used by PluginContextFactory). */
	invalidatePasteSort(): void {
		this.pasteInterceptorsSorted = null;
	}

	/** Returns paste interceptors in priority order. */
	getPasteInterceptors(): readonly PasteInterceptorEntry[] {
		return this.getSortedPasteInterceptors();
	}

	// --- Raw accessors for ContextFactoryDeps ---

	get rawMiddlewares(): MiddlewareEntry[] {
		return this.middlewares;
	}

	get rawPasteInterceptors(): PasteInterceptorEntry[] {
		return this.pasteInterceptors;
	}

	// --- Lifecycle ---

	clear(): void {
		this.middlewares.length = 0;
		this.middlewareSorted = null;
		this.pasteInterceptors.length = 0;
		this.pasteInterceptorsSorted = null;
	}

	// --- Private ---

	private getSortedMiddleware(): MiddlewareEntry[] {
		if (!this.middlewareSorted) {
			this.middlewareSorted = [...this.middlewares].sort((a, b) => a.priority - b.priority);
		}
		return this.middlewareSorted;
	}

	private getSortedPasteInterceptors(): PasteInterceptorEntry[] {
		if (!this.pasteInterceptorsSorted) {
			this.pasteInterceptorsSorted = [...this.pasteInterceptors].sort(
				(a, b) => a.priority - b.priority,
			);
		}
		return this.pasteInterceptorsSorted;
	}
}
