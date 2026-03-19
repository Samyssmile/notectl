/**
 * Toolbar item registration for list block types.
 * Registers bullet, ordered, and checklist toolbar buttons with active-state detection.
 */

import { isTextSelection, selectionRange } from '../../model/Selection.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import { allBlocksMatchListType } from './ListCommands.js';
import type { ListTypeDefinition } from './ListDefinitions.js';
import type { ListLocale } from './ListLocale.js';
import type { ListType } from './ListPlugin.js';

/** Registers toolbar items for each enabled list type. */
export function registerListToolbarItems(
	context: PluginContext,
	enabledTypes: readonly ListTypeDefinition[],
	locale: ListLocale,
): void {
	for (const def of enabledTypes) {
		context.registerToolbarItem({
			id: `list-${def.type}`,
			group: 'block',
			icon: def.icon,
			label: getListLabel(def.type, locale),
			command: `toggleList:${def.type}`,
			isActive: (state) => isListActive(state, def.type),
		});
	}
}

// --- Helpers ---

function getListLabel(type: ListType, locale: ListLocale): string {
	const labels: Record<ListType, string> = {
		bullet: locale.bulletList,
		ordered: locale.numberedList,
		checklist: locale.checklist,
	};
	return labels[type];
}

function isListActive(state: EditorState, listType: ListType): boolean {
	if (!isTextSelection(state.selection)) return false;

	if (state.selection.anchor.blockId !== state.selection.head.blockId) {
		const range = selectionRange(state.selection, state.getBlockOrder());
		return allBlocksMatchListType(state, range, listType);
	}

	const block = state.getBlock(state.selection.anchor.blockId);
	return block?.type === 'list_item' && block.attrs?.listType === listType;
}
