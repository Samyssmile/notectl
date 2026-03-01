/**
 * ContentStyleInjector: CSP-compliant utilities for injecting collected CSS
 * into the document. Supports nonce-based `<style>` elements for strict CSP policies.
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
