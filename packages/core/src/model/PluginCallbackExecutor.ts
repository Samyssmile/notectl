/**
 * Shared error boundary for callbacks contributed by plugins.
 *
 * Registries keep callback ownership as data; input and view consumers use this
 * executor so every extension point has the same attribution and failure
 * semantics. The reporter is injected by PluginManager, keeping the model layer
 * independent from the concrete logger implementation.
 */

export type PluginCallbackKind =
	| 'paste-interceptor'
	| 'text-input-interceptor'
	| 'input-rule'
	| 'keymap'
	| 'file-handler'
	| 'markdown-paste'
	| 'markdown-syntax'
	| 'node-view'
	| 'schema-extension'
	| 'schema-parse'
	| 'schema-render'
	| 'widget-render';

export interface PluginCallbackIdentity {
	readonly pluginId: string;
	readonly name: string;
	readonly kind: PluginCallbackKind;
}

export interface PluginCallbackRegistration {
	readonly pluginId: string;
	readonly name: string;
}

export interface PluginCallbackFailure extends PluginCallbackIdentity {
	readonly cause: unknown;
}

export type PluginCallbackOutcome<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false };

export type PluginCallbackReporter = (failure: PluginCallbackFailure) => void;

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
	return (
		(typeof value === 'object' || typeof value === 'function') &&
		value !== null &&
		'then' in value &&
		typeof value.then === 'function'
	);
}

export class PluginCallbackExecutor {
	static readonly silent = new PluginCallbackExecutor();

	constructor(private readonly failureReporter: PluginCallbackReporter = () => {}) {}

	/** Executes a synchronous callback without allowing it to escape its plugin boundary. */
	execute<T>(identity: PluginCallbackIdentity, callback: () => T): PluginCallbackOutcome<T> {
		try {
			return { ok: true, value: callback() };
		} catch (cause) {
			this.reportFailure(identity, cause);
			return { ok: false };
		}
	}

	/**
	 * Executes a callback that may be synchronous or asynchronous while
	 * preserving synchronous completion for boolean handlers that return
	 * immediately. Promise rejections use the same attributed error boundary.
	 */
	executeMaybeAsync<T>(
		identity: PluginCallbackIdentity,
		callback: () => T | PromiseLike<T>,
	): PluginCallbackOutcome<T> | Promise<PluginCallbackOutcome<T>> {
		const started = this.execute(identity, callback);
		if (!started.ok) return started;
		try {
			if (!isPromiseLike(started.value)) return { ok: true, value: started.value };

			return Promise.resolve(started.value).then(
				(value): PluginCallbackOutcome<T> => ({ ok: true, value }),
				(cause): PluginCallbackOutcome<T> => {
					this.reportFailure(identity, cause);
					return { ok: false };
				},
			);
		} catch (cause) {
			// Accessing a hostile thenable's `then` getter can itself throw.
			this.reportFailure(identity, cause);
			return { ok: false };
		}
	}

	/** Reports an already-caught failure through the same guarded attribution boundary. */
	reportFailure(identity: PluginCallbackIdentity, cause: unknown): void {
		// A telemetry adapter is outside the plugin's trust boundary too. A broken
		// reporter must never re-expose the original callback failure to browser input.
		try {
			const result: unknown = this.failureReporter({ ...identity, cause });
			if (result !== null && (typeof result === 'object' || typeof result === 'function')) {
				void Promise.resolve(result).then(undefined, () => undefined);
			}
		} catch {
			// Reporting is best-effort; input recovery remains authoritative.
		}
	}
}
