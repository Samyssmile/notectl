/**
 * Style rehydration for HTML import and paste: before the parse rules run,
 * every style the HTML gives an element becomes readable through the CSSOM
 * (`el.style`), which is where the rules read it. Import and both paste routes
 * share this one step, so they read styles alike on every page.
 */

import { type CSSDeclaration, parseDeclaration, splitDeclarations } from '../model/StyleClass.js';
import { type ClassDeclarationResolver, rehydrateStyleClasses } from './StyleClassHTML.js';

/** `!important` at the end of a declaration, which the CSSOM takes as its priority. */
const IMPORTANT_PRIORITY: RegExp = /\s*!\s*important\s*$/i;

/**
 * Rehydrates the styles of parsed content HTML in cascade order: first each
 * element's own `style` attribute, then the declarations its classes stand for,
 * which only fill properties the element does not set inline (#269).
 */
export function rehydrateStyles(root: ParentNode, resolveClass: ClassDeclarationResolver): void {
	restoreInlineStyles(root);
	rehydrateStyleClasses(root, resolveClass);
}

/**
 * Applies `style` attributes the browser kept out of the CSSOM. Under a strict
 * CSP (`style-src-attr 'none'`) Chromium keeps the attribute text but leaves
 * `el.style` empty, even in inert template content (#272), while CSSOM writes
 * stay allowed. Without such a policy the CSSOM already holds the declarations,
 * and the element is left as it is.
 */
function restoreInlineStyles(root: ParentNode): void {
	for (const element of Array.from(root.querySelectorAll('[style]'))) {
		const style: CSSStyleDeclaration | undefined = inlineStyleOf(element);
		if (!style || style.length > 0) continue;
		// Split the whole text first: the browser writes the CSSOM back into the attribute.
		const declarations: string[] = splitDeclarations(element.getAttribute('style') ?? '');
		for (const declaration of declarations) restoreDeclaration(style, declaration);
	}
}

/** The CSSOM declaration of an element, unless its namespace has none. */
function inlineStyleOf(element: Element): CSSStyleDeclaration | undefined {
	return (element as Partial<ElementCSSInlineStyle>).style;
}

/**
 * Writes one declaration through the CSSOM. As in CSS, a later declaration
 * replaces an earlier one unless only the earlier one is `!important`.
 */
function restoreDeclaration(style: CSSStyleDeclaration, declaration: string): void {
	const important: boolean = IMPORTANT_PRIORITY.test(declaration);
	const parsed: CSSDeclaration | undefined = parseDeclaration(
		declaration.replace(IMPORTANT_PRIORITY, ''),
	);
	if (!parsed) return;
	if (!important && style.getPropertyPriority(parsed.property) === 'important') return;
	style.setProperty(parsed.property, parsed.value, important ? 'important' : '');
}
