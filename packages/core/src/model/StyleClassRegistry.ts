/**
 * The style classes of one editor and the rules they follow: one class per
 * declaration and one declaration per class, each a plain CSS class name
 * outside notectl's reserved prefix. Registering the same pair again (for
 * example from a second plugin) is counted, so every registrant can remove its
 * own registration without taking the class from the others.
 */

import {
	type CSSDeclaration,
	type StyleClass,
	formatDeclaration,
	parseDeclaration,
} from './StyleClass.js';

/** Reserved for the class names notectl generates itself (`notectl-align-*`, `notectl-s-*`). */
const RESERVED_PREFIX = 'notectl-';

/** One CSS identifier that is valid in a `class` attribute and a selector without escaping. */
const CLASS_NAME_PATTERN: RegExp = /^-?[A-Za-z_][A-Za-z0-9_-]*$/;

interface StyleClassEntry {
	readonly styleClass: StyleClass;
	registrations: number;
}

export class StyleClassRegistry {
	private readonly byClassName = new Map<string, StyleClassEntry>();
	private readonly byDeclaration = new Map<string, StyleClassEntry>();

	/** Number of distinct registered style classes. */
	get size(): number {
		return this.byClassName.size;
	}

	/**
	 * Registers a style class. Throws a `TypeError` when it is invalid, when its
	 * class already stands for another declaration, or when its declaration
	 * already has another class.
	 */
	register(styleClass: StyleClass): void {
		const { className, declaration }: StyleClass = validateStyleClass(styleClass);
		const sameClass: StyleClassEntry | undefined = this.byClassName.get(className);
		if (sameClass && sameClass.styleClass.declaration !== declaration) {
			throw new TypeError(
				`Class "${className}" already stands for "${sameClass.styleClass.declaration}"; give "${declaration}" its own class.`,
			);
		}
		const sameDeclaration: StyleClassEntry | undefined = this.byDeclaration.get(declaration);
		if (sameDeclaration && sameDeclaration.styleClass.className !== className) {
			throw new TypeError(
				`"${declaration}" already has the class "${sameDeclaration.styleClass.className}"; a declaration can have only one class.`,
			);
		}
		if (sameClass) {
			sameClass.registrations++;
			return;
		}
		const entry: StyleClassEntry = {
			styleClass: Object.freeze({ className, declaration }),
			registrations: 1,
		};
		this.byClassName.set(className, entry);
		this.byDeclaration.set(declaration, entry);
	}

	/** Removes one registration of `styleClass`; others keep the class registered. */
	remove(styleClass: StyleClass): void {
		const entry: StyleClassEntry | undefined = this.byClassName.get(styleClass.className);
		if (!entry || !this.isSameDeclaration(entry, styleClass)) return;
		entry.registrations--;
		if (entry.registrations > 0) return;
		this.byClassName.delete(entry.styleClass.className);
		this.byDeclaration.delete(entry.styleClass.declaration);
	}

	/** Returns the style class with this class name, or `undefined`. */
	get(className: string): StyleClass | undefined {
		return this.byClassName.get(className)?.styleClass;
	}

	/** Returns all style classes in registration order. */
	list(): readonly StyleClass[] {
		return [...this.byClassName.values()].map((entry: StyleClassEntry) => entry.styleClass);
	}

	clear(): void {
		this.byClassName.clear();
		this.byDeclaration.clear();
	}

	private isSameDeclaration(entry: StyleClassEntry, styleClass: StyleClass): boolean {
		const parsed: CSSDeclaration | undefined =
			typeof styleClass.declaration === 'string'
				? parseDeclaration(styleClass.declaration)
				: undefined;
		return parsed !== undefined && formatDeclaration(parsed) === entry.styleClass.declaration;
	}
}

/**
 * Validates a style class and returns a frozen copy with its declaration in
 * `property: value` form. Throws a `TypeError` that explains how to fix the
 * first problem it finds.
 */
export function validateStyleClass(styleClass: StyleClass): StyleClass {
	const declaration: unknown = styleClass?.declaration;
	const parsed: CSSDeclaration | undefined =
		typeof declaration === 'string' ? parseDeclaration(declaration) : undefined;
	if (!parsed) {
		throw new TypeError(
			`Invalid declaration ${JSON.stringify(declaration)}: use one CSS declaration such as "color: #e03131".`,
		);
	}
	const normalized: string = formatDeclaration(parsed);
	const className: unknown = styleClass.className;
	if (typeof className !== 'string' || !CLASS_NAME_PATTERN.test(className)) {
		throw new TypeError(
			`Invalid class name ${JSON.stringify(className)} for "${normalized}": use one CSS class name of letters, digits, "-" and "_", not starting with a digit.`,
		);
	}
	if (className.startsWith(RESERVED_PREFIX)) {
		throw new TypeError(
			`Class "${className}" for "${normalized}" uses the reserved prefix "${RESERVED_PREFIX}".`,
		);
	}
	return Object.freeze({ className, declaration: normalized });
}
