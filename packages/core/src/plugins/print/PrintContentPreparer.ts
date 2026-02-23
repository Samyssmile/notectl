/**
 * Prepares editor content for print output.
 * Clones the DOM, sanitizes interactive attributes, applies block filters,
 * and inserts header/footer elements.
 */

import type { PrintOptions } from './PrintTypes.js';

/** Deep-clones the .notectl-content element from the editor container. */
export function cloneContent(container: HTMLElement): HTMLElement {
	const content: HTMLElement | null = container.querySelector('.notectl-content');
	const source: HTMLElement = content ?? container;
	return source.cloneNode(true) as HTMLElement;
}

/** Sanitizes the cloned content for print: removes interactive attributes and selection styling. */
export function sanitize(clone: HTMLElement): void {
	// Remove contenteditable from the root
	clone.removeAttribute('contenteditable');

	// Remove selection-related CSS classes
	const selectionClasses: readonly string[] = ['notectl-node-selected', 'notectl-content--empty'];
	for (const cls of selectionClasses) {
		clone.classList.remove(cls);
		for (const el of clone.querySelectorAll(`.${cls}`)) {
			el.classList.remove(cls);
		}
	}

	// Remove data-placeholder to avoid showing placeholder in print
	clone.removeAttribute('data-placeholder');
}

/** Removes excluded block types and applies page-break-before to configured block types. */
export function applyBlockFilters(clone: HTMLElement, options: PrintOptions): void {
	if (options.excludeBlockTypes) {
		for (const type of options.excludeBlockTypes) {
			const elements: NodeListOf<Element> = clone.querySelectorAll(`[data-block-type="${type}"]`);
			for (const el of elements) {
				el.remove();
			}
		}
	}

	if (options.pageBreakBefore) {
		for (const type of options.pageBreakBefore) {
			const elements: NodeListOf<Element> = clone.querySelectorAll(`[data-block-type="${type}"]`);
			for (const el of elements) {
				(el as HTMLElement).style.breakBefore = 'page';
				(el as HTMLElement).style.pageBreakBefore = 'always';
			}
		}
	}
}

/** Resolves a header/footer value to an HTML string. */
function resolveContent(value: string | (() => string)): string {
	return typeof value === 'function' ? value() : value;
}

/** Inserts header and footer elements into the cloned content. */
export function insertHeaderFooter(clone: HTMLElement, options: PrintOptions): void {
	if (options.header) {
		const headerEl: HTMLDivElement = document.createElement('div');
		headerEl.className = 'notectl-print-header';
		headerEl.innerHTML = resolveContent(options.header);
		clone.insertBefore(headerEl, clone.firstChild);
	}

	if (options.footer) {
		const footerEl: HTMLDivElement = document.createElement('div');
		footerEl.className = 'notectl-print-footer';
		footerEl.innerHTML = resolveContent(options.footer);
		clone.appendChild(footerEl);
	}
}

/** Orchestrates all content preparation steps. Returns a ready-to-print DOM element. */
export function prepare(container: HTMLElement, options: PrintOptions): HTMLElement {
	const clone: HTMLElement = cloneContent(container);
	sanitize(clone);
	applyBlockFilters(clone, options);
	insertHeaderFooter(clone, options);
	return clone;
}
