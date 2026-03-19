/**
 * Factory for building list item block attributes.
 * Centralizes attribute construction to avoid repetitive inline object literals.
 */

import type { BlockAttrs } from '../../model/Document.js';
import type { ListType } from './ListPlugin.js';

/** Builds a `BlockAttrs` object for a list_item block. */
export function buildListItemAttrs(
	listType: ListType,
	indent: number,
	checked?: boolean,
): BlockAttrs {
	if (listType === 'checklist') {
		return { listType, indent, checked: checked ?? false };
	}
	return { listType, indent };
}
