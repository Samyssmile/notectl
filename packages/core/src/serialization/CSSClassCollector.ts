/**
 * CSSClassCollector: maps CSS declarations to class names during class-based
 * serialization and produces a minimal stylesheet for the classes it used.
 *
 * Each declaration that has an application style class (#269) gets that class.
 * The remaining declarations of a set share one notectl class: notectl's own
 * name when the set is a single alignment, otherwise a content-hashed
 * `notectl-s-*` name (FNV-1a), deterministic and independent of encounter order.
 */

import { type StyleClass, breaksOutOfRule, splitDeclarations } from '../model/StyleClass.js';
import type { StyleClassLookup } from './StyleClassHTML.js';

/** Prefix for generated style class names (avoids collisions with user classes). */
const CLASS_PREFIX = 'notectl-s-';

/** Base for hash encoding output. */
const HASH_BASE = 36;
/** Pad length for consistent 6-char hashes. */
const HASH_PAD_LENGTH = 6;

/** FNV-1a 32-bit offset basis. */
const FNV_OFFSET_BASIS = 0x811c9dc5;
/** FNV-1a 32-bit prime. */
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a 32-bit hash function.
 * Fast, no crypto dependency, excellent distribution for short strings.
 */
function fnv1aHash(input: string): string {
	let hash: number = FNV_OFFSET_BASIS;
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, FNV_PRIME);
	}
	// Convert to unsigned 32-bit, then to base-36, padded to 6 chars
	const unsigned: number = hash >>> 0;
	return unsigned.toString(HASH_BASE).padStart(HASH_PAD_LENGTH, '0');
}

/** Finds notectl's own class for a single remaining declaration, if it has one. */
export type DefaultClassName = (declaration: string) => string | undefined;

/**
 * Stateful collector that assigns CSS class names to declarations.
 * Used during a single serialization pass, then produces the collected stylesheet.
 */
export class CSSClassCollector {
	/** Class name → declarations of every class used so far, in first-use order. */
	private readonly rules: Map<string, string> = new Map();
	/** Normalized declarations → hashed class name. */
	private readonly hashedClassNames: Map<string, string> = new Map();
	/** Tracks used hashes to handle the (extremely rare) collision case. */
	private readonly usedHashes: Set<string> = new Set();

	/**
	 * @param lookup Finds the application style class of one declaration.
	 * @param defaultClassName notectl's own class for a single remaining declaration.
	 */
	constructor(
		private readonly lookup: StyleClassLookup = () => undefined,
		private readonly defaultClassName: DefaultClassName = () => undefined,
	) {}

	/**
	 * Returns the space-separated class names for the given CSS declarations:
	 * one application class per declaration that has one, then one notectl class
	 * for the rest. Declarations that could break out of a CSS rule are left out.
	 * Returns `''` when no declaration remains.
	 */
	getClassNames(declarations: string): string {
		const classNames: string[] = [];
		const unmapped: string[] = [];
		for (const declaration of splitDeclarations(declarations).sort()) {
			if (breaksOutOfRule(declaration)) continue;
			const styleClass: StyleClass | undefined = this.lookup(declaration);
			if (!styleClass) {
				unmapped.push(declaration);
				continue;
			}
			this.rules.set(styleClass.className, styleClass.declaration);
			if (!classNames.includes(styleClass.className)) classNames.push(styleClass.className);
		}
		if (unmapped.length > 0) classNames.push(this.notectlClassName(unmapped.join('; ')));
		return classNames.join(' ');
	}

	/** Produces CSS rules for all collected classes. Returns empty string if none collected. */
	toCSS(): string {
		return [...this.rules]
			.map(([className, declarations]) => `.${className} { ${declarations}; }`)
			.join('\n');
	}

	/**
	 * Returns a map from class name → CSS declarations for round-trip support.
	 * Used by `setContentHTML` to rehydrate class-based HTML.
	 */
	toStyleMap(): ReadonlyMap<string, string> {
		return new Map(this.rules);
	}

	private notectlClassName(normalized: string): string {
		const className: string = this.defaultClassName(normalized) ?? this.hashedClassName(normalized);
		if (!this.rules.has(className)) this.rules.set(className, normalized);
		return className;
	}

	private hashedClassName(normalized: string): string {
		const existing: string | undefined = this.hashedClassNames.get(normalized);
		if (existing) return existing;

		let hash: string = fnv1aHash(normalized);
		let suffix = 0;
		// Collision handling: append suffix counter if the hash is already in use
		// for a different declarations string
		while (this.usedHashes.has(hash)) {
			suffix++;
			hash = fnv1aHash(normalized + String(suffix));
		}
		this.usedHashes.add(hash);
		const className = `${CLASS_PREFIX}${hash}`;
		this.hashedClassNames.set(normalized, className);
		return className;
	}
}
