/**
 * Structured logger interface for the plugin infrastructure.
 *
 * Rationale:
 * - Direct `console.*` calls in shipped code leak debug artifacts to users
 *   and give embedding applications no way to silence, redirect, or
 *   instrument editor errors.
 * - A small Logger interface decouples the plugin runtime from its output
 *   sink, enabling dependency injection (Clean Code / DIP) and trivial
 *   replacement by test doubles.
 *
 * The API deliberately mirrors the widely understood `console` / Pino shape
 * (`error`, `warn`, `info`, `debug`) so that embedders can supply a custom
 * logger with a one-line adapter.
 */

/**
 * Minimal structured logger.
 *
 * All methods accept an optional `cause` — typically the `Error` being
 * reported, but it may carry arbitrary diagnostic context.
 */
export interface Logger {
	error(message: string, cause?: unknown): void;
	warn(message: string, cause?: unknown): void;
	info(message: string, cause?: unknown): void;
	debug(message: string, cause?: unknown): void;
}

/**
 * Default logger that forwards to the global `console`.
 *
 * This preserves the prior behavior (errors land in the browser console)
 * while still routing through the Logger interface so embedders can opt
 * into their own sink.
 */
export const consoleLogger: Logger = {
	error(message: string, cause?: unknown): void {
		if (cause === undefined) {
			console.error(message);
		} else {
			console.error(message, cause);
		}
	},
	warn(message: string, cause?: unknown): void {
		if (cause === undefined) {
			console.warn(message);
		} else {
			console.warn(message, cause);
		}
	},
	info(message: string, cause?: unknown): void {
		if (cause === undefined) {
			console.info(message);
		} else {
			console.info(message, cause);
		}
	},
	debug(message: string, cause?: unknown): void {
		if (cause === undefined) {
			console.debug(message);
		} else {
			console.debug(message, cause);
		}
	},
};

/**
 * No-op logger that swallows every message.
 *
 * Useful for tests that want full silence, and for embedders that supply
 * their own error-reporting pipeline and do not want the editor to log at all.
 */
export const silentLogger: Logger = {
	error(): void {},
	warn(): void {},
	info(): void {},
	debug(): void {},
};

/**
 * Wraps a logger so every message is prefixed with `[scope]`.
 *
 * Scoping keeps call sites concise while still producing messages that
 * clearly identify their origin in aggregated log output.
 */
export function scopedLogger(base: Logger, scope: string): Logger {
	const prefix = `[${scope}]`;
	return {
		error(message: string, cause?: unknown): void {
			base.error(`${prefix} ${message}`, cause);
		},
		warn(message: string, cause?: unknown): void {
			base.warn(`${prefix} ${message}`, cause);
		},
		info(message: string, cause?: unknown): void {
			base.info(`${prefix} ${message}`, cause);
		},
		debug(message: string, cause?: unknown): void {
			base.debug(`${prefix} ${message}`, cause);
		},
	};
}
