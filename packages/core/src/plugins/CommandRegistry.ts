/**
 * Manages command registration, execution, and read-only bypass.
 * Extracted from PluginManager for single-responsibility.
 */

import type { CommandEntry, CommandHandler, CommandOptions } from './Plugin.js';

export class CommandRegistry {
	private readonly commands = new Map<string, CommandEntry>();
	private readonlyBypassActive = false;

	/** Registers a named command. Throws if already registered. */
	register(
		name: string,
		handler: CommandHandler,
		pluginId: string,
		options?: CommandOptions,
	): void {
		if (this.commands.has(name)) {
			const existing = this.commands.get(name);
			throw new Error(`Command "${name}" is already registered by plugin "${existing?.pluginId}".`);
		}
		const readonlyAllowed: boolean = options?.readonlyAllowed ?? false;
		this.commands.set(name, { name, handler, pluginId, readonlyAllowed });
	}

	/** Returns whether a command can be executed given current read-only state. */
	canExecute(name: string, isReadOnly: boolean): boolean {
		const entry = this.commands.get(name);
		if (!entry) return false;
		if (isReadOnly && !entry.readonlyAllowed) return false;
		return true;
	}

	/** Executes a named command. Returns false if not found or blocked by read-only. */
	execute(name: string, isReadOnly: boolean): boolean {
		const entry = this.commands.get(name);
		if (!entry) return false;
		if (isReadOnly && !entry.readonlyAllowed) return false;

		const enableBypass: boolean = isReadOnly && entry.readonlyAllowed;
		if (enableBypass) this.readonlyBypassActive = true;
		try {
			return entry.handler();
		} catch (err) {
			console.error(`[PluginManager] Command "${name}" error:`, err);
			return false;
		} finally {
			if (enableBypass) this.readonlyBypassActive = false;
		}
	}

	/** Returns true when a readonlyAllowed command is currently executing. */
	isReadonlyBypassed(): boolean {
		return this.readonlyBypassActive;
	}

	has(name: string): boolean {
		return this.commands.has(name);
	}

	remove(name: string): void {
		this.commands.delete(name);
	}

	clear(): void {
		this.commands.clear();
		this.readonlyBypassActive = false;
	}

	/** Exposes internal map for ContextFactoryDeps assembly. */
	get rawMap(): Map<string, CommandEntry> {
		return this.commands;
	}
}
