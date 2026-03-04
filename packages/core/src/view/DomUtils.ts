/**
 * DOM utility functions for the view layer.
 * Keeps DOM operations out of the model layer.
 */

import type { BlockId } from '../model/TypeBrands.js';
import { blockId as toBlockId } from '../model/TypeBrands.js';

/** Creates an HTMLElement with the required `data-block-id` attribute. */
export function createBlockElement(tag: string, blockId: BlockId): HTMLElement {
	const el = document.createElement(tag);
	el.setAttribute('data-block-id', blockId);
	return el;
}

/** Builds the block path from a leaf element up to the container. */
export function buildBlockPath(container: HTMLElement, leafBlockEl: HTMLElement): BlockId[] {
	const path: BlockId[] = [];
	let current: HTMLElement | null = leafBlockEl;
	while (current && current !== container) {
		if (current.hasAttribute('data-block-id')) {
			path.unshift(toBlockId(current.getAttribute('data-block-id') ?? ''));
		}
		current = current.parentElement;
	}
	return path;
}

/** Finds the nearest ancestor element with a `data-block-id` attribute. */
export function findBlockAncestor(container: HTMLElement, node: Node): HTMLElement | null {
	let current: Node | null = node;
	while (current && current !== container) {
		if (current instanceof HTMLElement && current.hasAttribute('data-block-id')) {
			return current;
		}
		current = current.parentNode;
	}
	return null;
}
