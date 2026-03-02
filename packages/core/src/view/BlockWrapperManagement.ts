/**
 * Block wrapper management: grouping consecutive blocks into shared
 * wrapper elements (e.g. `<ul>`, `<ol>` for list items).
 *
 * No dependencies on other view modules — works purely with DOM and model types.
 */

import type { BlockNode } from '../model/Document.js';
import type { WrapperSpec } from '../model/NodeSpec.js';
import type { SchemaRegistry } from '../model/SchemaRegistry.js';
import type { BlockId } from '../model/TypeBrands.js';

/**
 * Moves block elements out of wrapper elements (e.g. `<ul>`, `<ol>`) so the
 * main reconciliation loop sees all blocks as direct children of the container.
 */
export function unwrapBlocks(container: HTMLElement): void {
	const wrappers: Element[] = Array.from(
		container.querySelectorAll(':scope > [data-block-wrapper]'),
	);
	for (const wrapper of wrappers) {
		while (wrapper.firstChild) {
			container.insertBefore(wrapper.firstChild, wrapper);
		}
		wrapper.remove();
	}
}

/**
 * Groups consecutive blocks that declare the same wrapper key into shared
 * wrapper elements (`<ul>`, `<ol>`, etc.). Called after the main reconcile loop.
 */
export function wrapBlocks(
	container: HTMLElement,
	blocks: readonly BlockNode[],
	registry?: SchemaRegistry,
): void {
	if (!registry) return;

	// Compute wrapper groups from the block model
	interface WrapperGroup {
		readonly spec: WrapperSpec;
		readonly blockIds: readonly BlockId[];
	}

	const groups: WrapperGroup[] = [];
	let currentSpec: WrapperSpec | null = null;
	let currentIds: BlockId[] = [];

	for (const block of blocks) {
		const nodeSpec = registry.getNodeSpec(block.type);
		const wSpec: WrapperSpec | undefined = nodeSpec?.wrapper?.(block as never);

		if (wSpec && currentSpec && wSpec.key === currentSpec.key) {
			currentIds.push(block.id);
		} else if (wSpec) {
			if (currentSpec && currentIds.length > 0) {
				groups.push({ spec: currentSpec, blockIds: currentIds });
			}
			currentSpec = wSpec;
			currentIds = [block.id];
		} else {
			if (currentSpec && currentIds.length > 0) {
				groups.push({ spec: currentSpec, blockIds: currentIds });
			}
			currentSpec = null;
			currentIds = [];
		}
	}
	if (currentSpec && currentIds.length > 0) {
		groups.push({ spec: currentSpec, blockIds: currentIds });
	}

	// Apply wrapper elements to the DOM
	for (const group of groups) {
		const firstEl: HTMLElement | null = container.querySelector(
			`[data-block-id="${group.blockIds[0]}"]`,
		);
		if (!firstEl) continue;

		const wrapper: HTMLElement = document.createElement(group.spec.tag);
		wrapper.setAttribute('data-block-wrapper', group.spec.key);
		if (group.spec.className) {
			wrapper.className = group.spec.className;
		}
		if (group.spec.attrs) {
			for (const [key, value] of Object.entries(group.spec.attrs)) {
				wrapper.setAttribute(key, value);
			}
		}

		firstEl.before(wrapper);
		for (const bid of group.blockIds) {
			const el: HTMLElement | null = container.querySelector(`[data-block-id="${bid}"]`);
			if (el) {
				wrapper.appendChild(el);
			}
		}
	}
}

/**
 * Returns rendered top-level block elements in visual order.
 * Includes direct children and immediate children of block wrappers.
 */
export function getRenderedBlockElements(container: HTMLElement): readonly HTMLElement[] {
	const blocks: HTMLElement[] = [];
	for (const child of Array.from(container.children)) {
		if (!(child instanceof HTMLElement)) continue;
		if (child.hasAttribute('data-block-id')) {
			blocks.push(child);
			continue;
		}
		if (!child.hasAttribute('data-block-wrapper')) continue;

		for (const wrappedChild of Array.from(child.children)) {
			if (!(wrappedChild instanceof HTMLElement)) continue;
			if (wrappedChild.hasAttribute('data-block-id')) {
				blocks.push(wrappedChild);
			}
		}
	}
	return blocks;
}

/** Removes a rendered block from whichever parent currently owns it. */
export function removeBlockElement(el: HTMLElement): void {
	el.parentElement?.removeChild(el);
}

/** Replaces a rendered block in-place, honoring wrapper parents when present. */
export function replaceBlockElement(
	oldEl: HTMLElement,
	newEl: HTMLElement,
	container: HTMLElement,
): void {
	const parent: HTMLElement | null = oldEl.parentElement;
	if (parent) {
		parent.replaceChild(newEl, oldEl);
		return;
	}
	container.replaceChild(newEl, oldEl);
}

/**
 * Inserts a new rendered block after the given sibling.
 * If the sibling is inside a wrapper, insertion happens inside that wrapper.
 */
export function insertAfterPreviousSibling(
	container: HTMLElement,
	previousSibling: Element | null,
	newEl: HTMLElement,
): void {
	if (previousSibling?.parentElement) {
		const parent: HTMLElement = previousSibling.parentElement;
		if (previousSibling.nextSibling) {
			parent.insertBefore(newEl, previousSibling.nextSibling);
		} else {
			parent.appendChild(newEl);
		}
		return;
	}

	if (container.firstChild) {
		container.insertBefore(newEl, container.firstChild);
	} else {
		container.appendChild(newEl);
	}
}
