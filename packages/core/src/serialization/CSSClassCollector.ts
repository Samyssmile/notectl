/**
 * CSSClassCollector: maps CSS declarations to unique class names during serialization.
 * Deduplicates identical declaration sets and produces a minimal stylesheet.
 * Uses content-hash (FNV-1a) for deterministic, document-order-independent class names.
 */

/** Prefix for generated style class names (avoids collisions with user classes). */
const CLASS_PREFIX = 'notectl-s-';

/** Base for hash encoding output. */
const HASH_BASE = 36;
/** Pad length for consistent 6-char hashes. */
const HASH_PAD_LENGTH = 6;

/**
 * Normalizes a CSS declarations string by sorting individual declarations alphabetically.
 * This ensures `"color: red; font-size: 14px"` and `"font-size: 14px; color: red"` map
 * to the same class name.
 */
function normalizeDeclarations(declarations: string): string {
	return declarations
		.split(';')
		.map((d) => d.trim())
		.filter((d) => d.length > 0)
		.sort()
		.join('; ');
}

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

/**
 * Stateful collector that assigns CSS class names to unique declaration sets.
 * Used during a single serialization pass, then produces the collected stylesheet.
 *
 * Class names are deterministic: the same declarations always produce the same
 * class name, regardless of encounter order across documents.
 */
export class CSSClassCollector {
	/** Maps normalized declarations → class name. */
	private readonly classMap: Map<string, string> = new Map();
	/** Tracks used hashes to handle the (extremely rare) collision case. */
	private readonly usedHashes: Set<string> = new Set();

	/**
	 * Returns the class name for the given CSS declarations.
	 * If the same (normalized) declarations were seen before, returns the existing class.
	 */
	getClassName(declarations: string): string {
		const normalized: string = normalizeDeclarations(declarations);
		const existing: string | undefined = this.classMap.get(normalized);
		if (existing) return existing;

		let hash: string = fnv1aHash(normalized);
		let suffix = 0;
		// Collision handling: append suffix counter if the hash is already in use
		// for a different declarations string
		while (this.usedHashes.has(hash)) {
			suffix++;
			hash = fnv1aHash(normalized + String(suffix));
		}

		const className: string = `${CLASS_PREFIX}${hash}`;
		this.usedHashes.add(hash);
		this.classMap.set(normalized, className);
		return className;
	}

	/**
	 * Returns the semantic alignment class name for a given alignment value.
	 * Unlike style classes, alignment classes use descriptive names.
	 */
	getAlignmentClassName(alignment: string): string {
		const declarations: string = `text-align: ${alignment}`;
		const existing: string | undefined = this.classMap.get(declarations);
		if (existing) return existing;

		const className = `notectl-align-${alignment}`;
		this.classMap.set(declarations, className);
		return className;
	}

	/** Produces CSS rules for all collected classes. Returns empty string if none collected. */
	toCSS(): string {
		if (this.classMap.size === 0) return '';

		const rules: string[] = [];
		for (const [declarations, className] of this.classMap) {
			rules.push(`.${className} { ${declarations}; }`);
		}
		return rules.join('\n');
	}

	/**
	 * Returns a map from class name → CSS declarations for round-trip support.
	 * Used by `setContentHTML` to rehydrate class-based HTML.
	 */
	toStyleMap(): ReadonlyMap<string, string> {
		const map = new Map<string, string>();
		for (const [declarations, className] of this.classMap) {
			map.set(className, declarations);
		}
		return map;
	}
}
