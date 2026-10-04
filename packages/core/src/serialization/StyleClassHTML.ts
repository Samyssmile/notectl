/**
 * Style classes in HTML (#269): the class vocabulary of one export or import
 * pass. Export looks up the application class of each declaration; import
 * turns application classes, a caller's `styleMap` and notectl's own alignment
 * classes back into inline declarations that the parse rules already read.
 */

import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import {
	type CSSDeclaration,
	type StyleClass,
	formatDeclaration,
	parseDeclaration,
	splitDeclarations,
} from '../model/StyleClass.js';
import { defaultAlignmentDeclaration } from './AlignmentHTML.js';
import { type CSSValueCanonicalizer, createCSSValueCanonicalizer } from './CSSValueEquivalence.js';

/** Finds the style class that stands for one declaration during an export. */
export type StyleClassLookup = (declaration: string) => StyleClass | undefined;

/** Resolves a class name to the declarations it stands for during an import. */
export type ClassDeclarationResolver = (className: string) => string | undefined;

/** Returns the declaration in the form the CSS engine serializes it. */
export type DeclarationCanonicalizer = (declaration: CSSDeclaration) => string;

/**
 * Canonicalizes declarations with the engine's own CSS parser, the one that
 * also reads imported HTML. A browser reads `#e03131` back as
 * `rgb(224, 49, 49)` and may requote font families, so comparing the
 * canonical forms finds the class of a value in whichever spelling it has.
 * A value the engine rejects is compared as written.
 */
export function createCSSOMCanonicalizer(): DeclarationCanonicalizer {
	const canonicalValue: CSSValueCanonicalizer = createCSSValueCanonicalizer();
	return ({ property, value }: CSSDeclaration): string =>
		formatDeclaration({ property, value: canonicalValue(property, value) });
}

/**
 * Builds the export lookup for the given style classes. When two of them
 * stand for equivalent declarations, the first registered wins.
 */
export function createStyleClassLookup(
	styleClasses: readonly StyleClass[],
	canonicalize: DeclarationCanonicalizer = createCSSOMCanonicalizer(),
): StyleClassLookup {
	if (styleClasses.length === 0) return () => undefined;
	const keys = new Map<string, string | undefined>();
	const keyOf = (declaration: string): string | undefined => {
		if (!keys.has(declaration)) {
			const parsed: CSSDeclaration | undefined = parseDeclaration(declaration);
			keys.set(declaration, parsed ? canonicalize(parsed) : undefined);
		}
		return keys.get(declaration);
	};
	const byKey = new Map<string, StyleClass>();
	for (const styleClass of styleClasses) {
		const key: string | undefined = keyOf(styleClass.declaration);
		if (key !== undefined && !byKey.has(key)) byKey.set(key, styleClass);
	}
	return (declaration: string): StyleClass | undefined => {
		const key: string | undefined = keyOf(declaration);
		return key === undefined ? undefined : byKey.get(key);
	};
}

/**
 * Builds the import resolver: a caller's `styleMap` first (it describes the
 * exact HTML being imported), then the registered style classes, then
 * notectl's own `notectl-align-*` classes.
 */
export function createClassDeclarationResolver(
	registry?: SchemaRegistry,
	styleMap?: ReadonlyMap<string, string>,
): ClassDeclarationResolver {
	return (className: string): string | undefined =>
		styleMap?.get(className) ??
		registry?.getStyleClass(className)?.declaration ??
		defaultAlignmentDeclaration(className);
}

/**
 * Rehydrates class-based HTML: the declarations a class stands for are added
 * to the element's inline style, so parse rules read them like any inline
 * style. A property the element already sets inline wins over a class, and the
 * first listed class wins over later ones. The classes stay on the element, so
 * other parse rules can still read them. An element whose classes stand for
 * more than `maxDeclarations` declarations in total is left as it is.
 */
export function rehydrateStyleClasses(
	root: ParentNode,
	resolve: ClassDeclarationResolver,
	maxDeclarations: number,
): void {
	for (const element of Array.from(root.querySelectorAll('[class]'))) {
		const declarations: readonly string[] | undefined = classDeclarations(
			element,
			resolve,
			maxDeclarations,
		);
		if (declarations) addMissingDeclarations(element, declarations);
	}
}

/**
 * The declarations of an element's classes, first listed class first, or
 * `undefined` when they are more than `max`.
 */
function classDeclarations(
	element: Element,
	resolve: ClassDeclarationResolver,
	max: number,
): readonly string[] | undefined {
	const declarations: string[] = [];
	for (const className of Array.from(element.classList)) {
		const resolved: string | undefined = resolve(className);
		if (!resolved) continue;
		const parts: readonly string[] = splitDeclarations(resolved);
		if (declarations.length + parts.length > max) return undefined;
		declarations.push(...parts);
	}
	return declarations;
}

/**
 * Writes through the CSSOM: a strict CSP (`style-src-attr 'none'`) blocks
 * `style` attributes, in Chromium even in inert template content, but not
 * CSSOM writes. The browser serializes the result back into the attribute, so
 * parsers that read the raw attribute (table border color) still find it.
 */
function addMissingDeclarations(element: Element, declarations: readonly string[]): void {
	const style: CSSStyleDeclaration | undefined = (element as Partial<ElementCSSInlineStyle>).style;
	if (!style) return;
	for (const declaration of declarations) {
		const parsed: CSSDeclaration | undefined = parseDeclaration(declaration);
		if (!parsed || style.getPropertyValue(parsed.property)) continue;
		style.setProperty(parsed.property, parsed.value);
	}
}
