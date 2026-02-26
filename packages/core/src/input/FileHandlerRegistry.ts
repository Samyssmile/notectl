/**
 * FileHandlerRegistry: manages plugin-registered file handlers
 * for paste and drop operations, with MIME pattern matching.
 */

import type { Position } from '../model/Selection.js';

/** Handler for a single file pasted or dropped into the editor. */
export type FileHandler = (file: File, position: Position | null) => boolean | Promise<boolean>;

export interface FileHandlerEntry {
	readonly pattern: string;
	readonly handler: FileHandler;
}

export class FileHandlerRegistry {
	private readonly _fileHandlers: FileHandlerEntry[] = [];

	registerFileHandler(pattern: string, handler: FileHandler): void {
		this._fileHandlers.push({ pattern, handler });
	}

	getFileHandlers(): readonly FileHandlerEntry[] {
		return this._fileHandlers;
	}

	matchFileHandlers(mimeType: string): FileHandler[] {
		const handlers: FileHandler[] = [];
		for (const entry of this._fileHandlers) {
			if (matchMimePattern(entry.pattern, mimeType)) {
				handlers.push(entry.handler);
			}
		}
		return handlers;
	}

	removeFileHandler(handler: FileHandler): void {
		const idx = this._fileHandlers.findIndex((e) => e.handler === handler);
		if (idx !== -1) this._fileHandlers.splice(idx, 1);
	}

	clear(): void {
		this._fileHandlers.length = 0;
	}
}

/** Matches a MIME pattern (e.g. 'image/*') against a concrete MIME type. */
function matchMimePattern(pattern: string, mimeType: string): boolean {
	if (pattern === '*' || pattern === '*/*') return true;
	if (pattern === mimeType) return true;
	if (pattern.endsWith('/*')) {
		const prefix = pattern.slice(0, -1);
		return mimeType.startsWith(prefix);
	}
	return false;
}
