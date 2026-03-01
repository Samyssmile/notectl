/**
 * CSSClassCollector: maps CSS declarations to unique class names during serialization.
 * Deduplicates identical declaration sets and produces a minimal stylesheet.
 */

/** Prefix for generated style class names (avoids collisions with user classes). */
const CLASS_PREFIX = 'notectl-s';

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

/**
 * Stateful collector that assigns CSS class names to unique declaration sets.
 * Used during a single serialization pass, then produces the collected stylesheet.
 */
export class CSSClassCollector {
	private readonly classMap: Map<string, string> = new Map();
	private counter = 0;

	/**
	 * Returns the class name for the given CSS declarations.
	 * If the same (normalized) declarations were seen before, returns the existing class.
	 */
	getClassName(declarations: string): string {
		const normalized: string = normalizeDeclarations(declarations);
		const existing: string | undefined = this.classMap.get(normalized);
		if (existing) return existing;

		const className: string = `${CLASS_PREFIX}${this.counter.toString(36)}`;
		this.counter++;
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
}
