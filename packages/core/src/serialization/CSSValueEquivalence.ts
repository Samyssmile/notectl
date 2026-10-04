/**
 * CSS values as the browser's CSS engine reads them. Browsers re-serialize the
 * styles of imported HTML: `#e03131` reads back as `rgb(224, 49, 49)`, and font
 * families come back with other quotes or none. Two spellings are equivalent
 * when the engine reads them as the same value.
 */

/** Returns a value of `property` in the form the CSS engine serializes it. */
export type CSSValueCanonicalizer = (property: string, value: string) => string;

/** Returns the known spelling of a value, or `undefined` when no known value is equivalent. */
export type KnownValueLookup = (value: string) => string | undefined;

/**
 * Canonicalizes values with the engine's own CSS parser (CSSOM), the one that
 * also reads imported HTML; a strict CSP does not restrict it. A value the
 * engine rejects is returned as written.
 */
export function createCSSValueCanonicalizer(): CSSValueCanonicalizer {
	let scratch: CSSStyleDeclaration | undefined;
	return (property: string, value: string): string => {
		scratch ??= document.createElement('span').style;
		scratch.cssText = '';
		scratch.setProperty(property, value);
		return scratch.getPropertyValue(property) || value;
	};
}

/**
 * Builds the lookup of a plugin's own spellings for `property`: it finds the
 * one of `knownValues` that is equivalent to a given value, such as a palette's
 * `#e03131` for an imported `rgb(224, 49, 49)`. The first equivalent known
 * value wins. Known values are canonicalized once, at the first lookup.
 */
export function createKnownValueLookup(
	property: string,
	knownValues: readonly string[],
	canonicalize: CSSValueCanonicalizer = createCSSValueCanonicalizer(),
): KnownValueLookup {
	if (knownValues.length === 0) return () => undefined;
	let byCanonical: ReadonlyMap<string, string> | undefined;
	return (value: string): string | undefined => {
		byCanonical ??= indexByCanonicalValue(property, knownValues, canonicalize);
		return byCanonical.get(canonicalize(property, value));
	};
}

function indexByCanonicalValue(
	property: string,
	knownValues: readonly string[],
	canonicalize: CSSValueCanonicalizer,
): ReadonlyMap<string, string> {
	const index = new Map<string, string>();
	for (const known of knownValues) {
		const canonical: string = canonicalize(property, known);
		if (!index.has(canonical)) index.set(canonical, known);
	}
	return index;
}
