/**
 * Style rehydration for HTML import and paste: before the parse rules run,
 * every style the HTML gives an element becomes readable through the CSSOM
 * (`el.style`), which is where the rules read it. Import and both paste routes
 * share this one step, so they read styles alike on every page.
 */

import { splitDeclarations } from '../model/StyleClass.js';
import { type ClassDeclarationResolver, rehydrateStyleClasses } from './StyleClassHTML.js';

/**
 * The most declarations rehydrated on one element, from its `style` attribute
 * and from its classes each. Formatting needs far fewer. Input with more is not
 * formatting, and Chromium applies many distinct custom properties through the
 * CSSOM in superlinear time, so such an element keeps those styles unapplied
 * (#274).
 */
export const MAX_REHYDRATED_DECLARATIONS = 256;

/**
 * Rehydrates the styles of parsed content HTML in cascade order: first each
 * element's own `style` attribute, then the declarations its classes stand for,
 * which only fill properties the element does not set inline (#269).
 */
export function rehydrateStyles(root: ParentNode, resolveClass: ClassDeclarationResolver): void {
	restoreInlineStyles(root);
	rehydrateStyleClasses(root, resolveClass, MAX_REHYDRATED_DECLARATIONS);
}

/**
 * Applies `style` attributes the browser kept out of the CSSOM. Under a strict
 * CSP (`style-src-attr 'none'`) Chromium keeps the attribute text but leaves
 * `el.style` empty, even in inert template content (#272), while CSSOM writes
 * stay allowed. Without such a policy the CSSOM already holds the declarations,
 * so only an attribute the browser rejected entirely is parsed again, which
 * yields no declarations either. Afterwards the attribute holds the browser's
 * serialization, so code that needs the raw text reads it before this step.
 */
function restoreInlineStyles(root: ParentNode): void {
	for (const element of Array.from(root.querySelectorAll('[style]'))) {
		const style: CSSStyleDeclaration | undefined = inlineStyleOf(element);
		if (!style || style.length > 0) continue;
		const text: string = element.getAttribute('style') ?? '';
		if (splitDeclarations(text).length > MAX_REHYDRATED_DECLARATIONS) continue;
		// One write through the browser's own CSS parser, which reads priorities,
		// shorthands and comments as it reads the attribute on a page without a CSP.
		style.cssText = text;
	}
}

/** The CSSOM declaration of an element, unless its namespace has none. */
function inlineStyleOf(element: Element): CSSStyleDeclaration | undefined {
	return (element as Partial<ElementCSSInlineStyle>).style;
}
