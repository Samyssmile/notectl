/**
 * Application-defined CSS classes for content HTML (#269).
 *
 * A style class stands for exactly one CSS declaration: class-based export
 * writes the class wherever notectl would write that declaration, and HTML
 * import and paste read the class back as the declaration. The document keeps
 * storing semantic values (an `align` attribute, a `textColor` mark), never
 * class names.
 */

import { isSafeCSSValue } from './HTMLUtils.js';

/** An application CSS class that stands for one CSS declaration in content HTML. */
export interface StyleClass {
	/** The class written to class-based HTML, e.g. `'text-red'`. */
	readonly className: string;
	/** The one CSS declaration it stands for, e.g. `'color: #e03131'`. */
	readonly declaration: string;
}

/**
 * Application CSS classes keyed by a plugin's own values, e.g.
 * `{ center: 'align-center' }` for alignments or `{ '#e03131': 'text-red' }`
 * for colors.
 */
export type StyleClassNames<K extends PropertyKey = string> = Readonly<Partial<Record<K, string>>>;

/** One CSS declaration split into its property and value. */
export interface CSSDeclaration {
	readonly property: string;
	readonly value: string;
}

/** A CSS property name, including custom properties such as `--ntbl-bc`. */
const PROPERTY_PATTERN: RegExp = /^-{0,2}[A-Za-z_][A-Za-z0-9_-]*$/;

/** `!important` is dropped by the CSSOM, so it cannot round-trip through a class. */
const IMPORTANT_PATTERN: RegExp = /!\s*important/i;

/**
 * Parses one CSS declaration. The property is lowercased (custom properties
 * keep their case) and the value trimmed. Returns `undefined` unless the input
 * is exactly one declaration whose value cannot end its declaration or rule.
 */
export function parseDeclaration(declaration: string): CSSDeclaration | undefined {
	const colon: number = declaration.indexOf(':');
	if (colon < 0) return undefined;
	const name: string = declaration.slice(0, colon).trim();
	if (!PROPERTY_PATTERN.test(name)) return undefined;
	const value: string = withoutFinalSemicolon(declaration.slice(colon + 1).trim());
	if (!isSafeCSSValue(value) || IMPORTANT_PATTERN.test(value)) return undefined;
	return { property: name.startsWith('--') ? name : name.toLowerCase(), value };
}

function withoutFinalSemicolon(value: string): string {
	return value.endsWith(';') ? value.slice(0, -1).trimEnd() : value;
}

/** Writes a parsed declaration as `property: value`. */
export function formatDeclaration(declaration: CSSDeclaration): string {
	return `${declaration.property}: ${declaration.value}`;
}
