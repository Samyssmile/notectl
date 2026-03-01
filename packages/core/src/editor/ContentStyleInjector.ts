/**
 * ContentStyleInjector: CSP-compliant utilities for injecting collected CSS
 * into the document. Supports nonce-based `<style>` elements and adoptedStyleSheets.
 */

/** Options for {@link injectContentStyles}. */
export interface InjectStylesOptions {
	/** Nonce value for CSP compliance. Added as `nonce` attribute on the `<style>` element. */
	readonly nonce?: string;
	/** Target document. Defaults to `globalThis.document`. */
	readonly document?: Document;
	/** Container element to append the `<style>` to. Defaults to `document.head`. */
	readonly container?: HTMLElement;
	/**
	 * Unique ID for the `<style>` element. When provided and an element with this ID
	 * already exists, its content is replaced (avoiding duplicates on re-renders).
	 */
	readonly id?: string;
}

/**
 * Injects CSS into the document via a `<style>` element.
 * Returns the created/updated element for manual cleanup.
 *
 * @example
 * ```ts
 * const result = editor.getContentHTML({ cssMode: 'classes' });
 * const style = injectContentStyles(result.css, { nonce: 'abc123' });
 * // Later: removeContentStyles('notectl-content', document);
 * ```
 */
export function injectContentStyles(css: string, options?: InjectStylesOptions): HTMLStyleElement {
	const doc: Document = options?.document ?? globalThis.document;
	const container: HTMLElement = options?.container ?? doc.head;

	// Reuse existing element if ID matches
	if (options?.id) {
		const existing: HTMLElement | null = doc.getElementById(options.id);
		if (existing instanceof HTMLStyleElement) {
			existing.textContent = css;
			if (options.nonce) {
				existing.setAttribute('nonce', options.nonce);
			}
			return existing;
		}
	}

	const style: HTMLStyleElement = doc.createElement('style');
	style.textContent = css;

	if (options?.id) {
		style.id = options.id;
	}
	if (options?.nonce) {
		style.setAttribute('nonce', options.nonce);
	}

	container.appendChild(style);
	return style;
}

/**
 * Removes a previously injected `<style>` element by its ID.
 *
 * @param id - The ID of the `<style>` element to remove.
 * @param doc - Target document. Defaults to `globalThis.document`.
 */
export function removeContentStyles(id: string, doc?: Document): void {
	const target: Document = doc ?? globalThis.document;
	const element: HTMLElement | null = target.getElementById(id);
	if (element) {
		element.remove();
	}
}

/** Options for {@link adoptContentStyles}. */
export interface AdoptStylesOptions {
	/** Target document or ShadowRoot. Defaults to `globalThis.document`. */
	readonly target?: Document | ShadowRoot;
	/**
	 * When true, replaces any previously adopted notectl sheet on the same target.
	 * When false (default), appends a new sheet.
	 */
	readonly replace?: boolean;
}

/** WeakSet tracking sheets created by {@link adoptContentStyles}. */
const notectlSheets: WeakSet<CSSStyleSheet> = new WeakSet();

/**
 * Injects CSS via `adoptedStyleSheets` — no DOM element, no nonce needed.
 * Works with both `Document` and `ShadowRoot`, making it ideal for Web Components.
 *
 * Returns the created `CSSStyleSheet` for manual cleanup via {@link removeAdoptedStyles}.
 *
 * @example
 * ```ts
 * const result = editor.getContentHTML({ cssMode: 'classes' });
 * const sheet = adoptContentStyles(result.css);
 * // Later: removeAdoptedStyles(sheet);
 * ```
 */
export function adoptContentStyles(css: string, options?: AdoptStylesOptions): CSSStyleSheet {
	const target: Document | ShadowRoot = options?.target ?? globalThis.document;
	const sheet = new CSSStyleSheet();
	sheet.replaceSync(css);
	notectlSheets.add(sheet);

	if (options?.replace) {
		target.adoptedStyleSheets = target.adoptedStyleSheets.filter((s) => !notectlSheets.has(s));
	}

	target.adoptedStyleSheets = [...target.adoptedStyleSheets, sheet];
	return sheet;
}

/**
 * Removes a specific adopted stylesheet from its target.
 *
 * @param sheet - The `CSSStyleSheet` returned by {@link adoptContentStyles}.
 * @param target - Target document or ShadowRoot. Defaults to `globalThis.document`.
 */
export function removeAdoptedStyles(sheet: CSSStyleSheet, target?: Document | ShadowRoot): void {
	const root: Document | ShadowRoot = target ?? globalThis.document;
	root.adoptedStyleSheets = root.adoptedStyleSheets.filter((s) => s !== sheet);
}
