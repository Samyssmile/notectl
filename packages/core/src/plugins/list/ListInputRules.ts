/**
 * Input rule registration for list block types.
 * Converts `- `, `* `, `1. `, `[ ] `, `[x] ` at the start of a paragraph into list items.
 */

import { createCollapsedSelection, isCollapsed, isTextSelection } from '../../model/Selection.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { PluginContext } from '../Plugin.js';
import { buildListItemAttrs } from './ListAttrsFactory.js';
import type { ListTypeDefinition } from './ListDefinitions.js';

/** Registers markdown-style input rules for configured list types. */
export function registerListInputRules(
	context: PluginContext,
	enabledTypes: readonly ListTypeDefinition[],
): void {
	for (const def of enabledTypes) {
		context.registerInputRule({
			pattern: def.inputPattern,
			handler: (state, match, start, _end) => {
				const sel = state.selection;
				if (!isTextSelection(sel)) return null;
				if (!isCollapsed(sel)) return null;

				const block = state.getBlock(sel.anchor.blockId);
				if (!block || block.type !== 'paragraph') return null;

				const matchStr = match[0] ?? '';
				const matchLen = matchStr.length;
				const attrs = buildListItemAttrs(def.type, 0, matchStr.includes('[x]'));

				return state
					.transaction('input')
					.deleteTextAt(sel.anchor.blockId, start, start + matchLen)
					.setBlockType(sel.anchor.blockId, nodeType('list_item'), attrs)
					.setSelection(createCollapsedSelection(sel.anchor.blockId, 0))
					.build();
			},
		});
	}
}
