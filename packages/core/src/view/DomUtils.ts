/**
 * DOM utility functions for the view layer.
 * Keeps DOM operations out of the model layer.
 */

import type { BlockId } from '../model/TypeBrands.js';

/** Creates an HTMLElement with the required `data-block-id` attribute. */
export function createBlockElement(tag: string, blockId: BlockId): HTMLElement {
	const el = document.createElement(tag);
	el.setAttribute('data-block-id', blockId);
	return el;
}
