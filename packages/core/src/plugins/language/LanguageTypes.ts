/**
 * Unified language support types for programming language registration.
 *
 * Bundles syntax highlighting and paste detection into a single
 * registration unit so that all artifacts for one language live together.
 */

import { ServiceKey } from '../Plugin.js';
import type { LanguageDefinition } from '../code-block/highlighter/TokenizerTypes.js';
import type { ContentDetector } from '../smart-paste/SmartPasteTypes.js';

/**
 * Unified language support bundle grouping all artifacts for one
 * programming language: syntax highlighting, paste detection, and
 * (optionally) code formatting.
 *
 * Pass to `LanguageRegistryService.register()` to make a language
 * available across all participating plugins in a single call.
 */
export interface LanguageSupport {
	/** Canonical lowercase identifier (e.g. `'java'`, `'python'`). */
	readonly id: string;

	/** Human-readable name shown in the language picker (e.g. `'Java'`). */
	readonly displayName: string;

	/** Alternative names accepted as aliases (e.g. `['py', 'py3']`). */
	readonly aliases?: readonly string[];

	/** Syntax highlighting token patterns for the RegexTokenizer. */
	readonly highlighting?: LanguageDefinition;

	/** Smart-paste detector for auto-detecting this language in pasted text. */
	readonly detection?: ContentDetector;

	/**
	 * Code formatter for reformatting code block content on demand.
	 * @experimental Not yet consumed by any built-in plugin.
	 */
	readonly formatter?: CodeFormatter;
}

/**
 * Formatter that can reformat source code.
 * @experimental Reserved for future use.
 */
export interface CodeFormatter {
	format(code: string): string | Promise<string>;
}

/** Service for registering and querying language support bundles. */
export interface LanguageRegistryService {
	/** Registers a language bundle. Re-registering the same `id` overwrites. */
	register(support: LanguageSupport): void;

	/**
	 * Subscribes to language registrations with replay semantics.
	 * The listener is immediately called for all already-registered
	 * bundles, then called for each future registration.
	 */
	onRegister(listener: LanguageRegistryListener): void;

	/** Returns the bundle for the given language id, or `undefined`. */
	get(id: string): LanguageSupport | undefined;

	/** Returns all registered language support bundles. */
	getAll(): readonly LanguageSupport[];
}

/** Internal listener type for registry change notifications. */
export type LanguageRegistryListener = (support: LanguageSupport) => void;

export const LANGUAGE_REGISTRY_SERVICE_KEY = new ServiceKey<LanguageRegistryService>(
	'languageRegistry',
);
