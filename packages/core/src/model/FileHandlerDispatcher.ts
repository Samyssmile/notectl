/** Shared sequential dispatcher for plugin-contributed paste/drop file handlers. */

import type { FileHandlerEntry, FileHandlerRegistry } from './FileHandlerRegistry.js';
import { PluginCallbackExecutor, type PluginCallbackOutcome } from './PluginCallbackExecutor.js';
import type { Position } from './Selection.js';

export interface FileHandlerDispatchOutcome {
	readonly handled: boolean;
	/** True when the owning paste/drop surface was destroyed during an async callback. */
	readonly cancelled: boolean;
}

export interface FileHandlerDispatchOptions {
	readonly registry: FileHandlerRegistry;
	readonly executor?: PluginCallbackExecutor;
	readonly files: readonly File[];
	/** Re-evaluated before each handler so an async drop position can be mapped. */
	readonly getPosition: () => Position | null;
	readonly isActive?: () => boolean;
}

/**
 * Runs handlers in file order and registration order. `false`, synchronous
 * throws, and Promise rejections continue to the next matching handler. The
 * first `true` claims that file; remaining files are still offered to handlers.
 *
 * The return remains synchronous until a handler actually returns a Promise,
 * allowing callers to preserve native event semantics for fully synchronous
 * chains.
 */
export function dispatchFilesToHandlers(
	options: FileHandlerDispatchOptions,
): FileHandlerDispatchOutcome | Promise<FileHandlerDispatchOutcome> {
	const executor = options.executor ?? PluginCallbackExecutor.silent;
	const isActive = options.isActive ?? (() => true);
	// One dispatch observes one registry generation. Handler callbacks are allowed
	// to unregister themselves (including while awaited); retaining the matching
	// entry objects prevents index shifts from skipping later handlers.
	const files: readonly File[] = [...options.files];
	const entriesByFile: readonly (readonly FileHandlerEntry[])[] = files.map((file) =>
		options.registry.matchFileHandlerEntries(file.type),
	);

	const run = (
		fileIndex: number,
		handlerIndex: number,
		handled: boolean,
	): FileHandlerDispatchOutcome | Promise<FileHandlerDispatchOutcome> => {
		let currentFileIndex = fileIndex;
		let currentHandlerIndex = handlerIndex;
		let anyHandled = handled;

		while (currentFileIndex < files.length) {
			if (!isActive()) return { handled: anyHandled, cancelled: true };
			const file = files[currentFileIndex];
			if (!file) {
				currentFileIndex++;
				currentHandlerIndex = 0;
				continue;
			}
			const entries: readonly FileHandlerEntry[] = entriesByFile[currentFileIndex] ?? [];
			const entry = entries[currentHandlerIndex];
			if (!entry) {
				currentFileIndex++;
				currentHandlerIndex = 0;
				continue;
			}

			const outcome = executor.executeMaybeAsync(
				{
					pluginId: entry.pluginId,
					name: entry.name,
					kind: 'file-handler',
				},
				() => entry.handler(file, options.getPosition()),
			);
			if (outcome instanceof Promise) {
				return outcome.then((settled) =>
					continueAfterOutcome(settled, currentFileIndex, currentHandlerIndex, anyHandled, run),
				);
			}

			if (outcome.ok && outcome.value === true) {
				anyHandled = true;
				currentFileIndex++;
				currentHandlerIndex = 0;
			} else {
				currentHandlerIndex++;
			}
		}

		return isActive()
			? { handled: anyHandled, cancelled: false }
			: { handled: anyHandled, cancelled: true };
	};

	return run(0, 0, false);
}

function continueAfterOutcome(
	outcome: PluginCallbackOutcome<boolean>,
	fileIndex: number,
	handlerIndex: number,
	handled: boolean,
	run: (
		fileIndex: number,
		handlerIndex: number,
		handled: boolean,
	) => FileHandlerDispatchOutcome | Promise<FileHandlerDispatchOutcome>,
): FileHandlerDispatchOutcome | Promise<FileHandlerDispatchOutcome> {
	if (outcome.ok && outcome.value === true) {
		return run(fileIndex + 1, 0, true);
	}
	return run(fileIndex, handlerIndex + 1, handled);
}
