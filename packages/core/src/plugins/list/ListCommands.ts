/**
 * Command registration and implementations for list block types.
 * Handles toggle between list types and paragraph, indent/outdent,
 * and checklist toggle.
 */

import { forEachBlockIdInRange } from '../../commands/RangeIterator.js';
import { isNodeOfType } from '../../model/AttrRegistry.js';
import { isTextSelection, selectionRange } from '../../model/Selection.js';
import { type BlockId, nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import type { ListTypeDefinition } from './ListDefinitions.js';
import type { ListConfig, ListType } from './ListPlugin.js';

/** Registers all list commands (toggleList:*, indent, outdent, toggleChecklistItem). */
export function registerListCommands(
	context: PluginContext,
	config: ListConfig,
	enabledTypes: readonly ListTypeDefinition[],
): void {
	for (const def of enabledTypes) {
		context.registerCommand(`toggleList:${def.type}`, () => {
			return toggleList(context, def.type);
		});
	}

	context.registerCommand('indentListItem', () => changeIndent(context, 1, config.maxIndent));

	context.registerCommand('outdentListItem', () => changeIndent(context, -1, config.maxIndent));

	if (config.types.includes('checklist')) {
		context.registerCommand(
			'toggleChecklistItem',
			() => toggleChecked(context, config.interactiveCheckboxes),
			{ readonlyAllowed: true },
		);
	}

	context.registerKeymap({
		Tab: () => changeIndent(context, 1, config.maxIndent),
		'Shift-Tab': () => changeIndent(context, -1, config.maxIndent),
	});
}

// --- Command Implementations ---

function toggleList(context: PluginContext, listType: ListType): boolean {
	const state: EditorState = context.getState();
	const sel = state.selection;
	if (!isTextSelection(sel)) return false;

	if (sel.anchor.blockId !== sel.head.blockId) {
		return toggleListRange(context, state, listType);
	}
	return toggleListSingleBlock(context, state, listType);
}

function toggleListSingleBlock(
	context: PluginContext,
	state: EditorState,
	listType: ListType,
): boolean {
	const sel = state.selection;
	if (!isTextSelection(sel)) return false;
	const block = state.getBlock(sel.anchor.blockId);
	if (!block) return false;

	if (block.type === 'list_item' && block.attrs?.listType === listType) {
		const tr = state
			.transaction('command')
			.setBlockType(sel.anchor.blockId, nodeType('paragraph'))
			.setSelection(sel)
			.build();
		context.dispatch(tr);
		return true;
	}

	const attrs: Record<string, string | number | boolean> = {
		listType,
		indent: isNodeOfType(block, 'list_item') ? block.attrs.indent : 0,
	};
	if (listType === 'checklist') {
		attrs.checked = false;
	}

	const tr = state
		.transaction('command')
		.setBlockType(sel.anchor.blockId, nodeType('list_item'), attrs)
		.setSelection(sel)
		.build();
	context.dispatch(tr);
	return true;
}

function toggleListRange(context: PluginContext, state: EditorState, listType: ListType): boolean {
	const sel = state.selection;
	if (!isTextSelection(sel)) return false;

	const range = selectionRange(sel, state.getBlockOrder());
	const toggleOff: boolean = allBlocksMatchListType(state, range, listType);
	const builder = state.transaction('command');

	forEachBlockIdInRange(state, range, (bid: BlockId) => {
		const block = state.getBlock(bid);
		if (!block) return;

		if (toggleOff) {
			builder.setBlockType(bid, nodeType('paragraph'));
		} else {
			const attrs: Record<string, string | number | boolean> = {
				listType,
				indent: isNodeOfType(block, 'list_item') ? block.attrs.indent : 0,
			};
			if (listType === 'checklist') {
				attrs.checked =
					isNodeOfType(block, 'list_item') &&
					block.attrs.listType === 'checklist' &&
					block.attrs.checked;
			}
			builder.setBlockType(bid, nodeType('list_item'), attrs);
		}
	});

	builder.setSelection(sel);
	context.dispatch(builder.build());
	return true;
}

// --- Indent / Outdent ---

function changeIndent(context: PluginContext, delta: 1 | -1, maxIndent: number): boolean {
	const state: EditorState = context.getState();
	if (!isTextSelection(state.selection)) return false;

	if (state.selection.anchor.blockId !== state.selection.head.blockId) {
		return changeIndentRange(context, state, delta, maxIndent);
	}

	const sel = state.selection;
	const block = state.getBlock(sel.anchor.blockId);
	if (!block || !isNodeOfType(block, 'list_item')) return false;

	const newIndent: number = block.attrs.indent + delta;
	if (newIndent < 0 || newIndent > maxIndent) return false;

	const attrs = { ...block.attrs, indent: newIndent } as Record<string, string | number | boolean>;
	const tr = state
		.transaction('command')
		.setBlockType(sel.anchor.blockId, nodeType('list_item'), attrs)
		.setSelection(sel)
		.build();
	context.dispatch(tr);
	return true;
}

function changeIndentRange(
	context: PluginContext,
	state: EditorState,
	delta: 1 | -1,
	maxIndent: number,
): boolean {
	const sel = state.selection;
	if (!isTextSelection(sel)) return false;

	const range = selectionRange(sel, state.getBlockOrder());
	const builder = state.transaction('command');
	let changed = false;

	forEachBlockIdInRange(state, range, (bid: BlockId) => {
		const block = state.getBlock(bid);
		if (!block || !isNodeOfType(block, 'list_item')) return;

		const newIndent: number = block.attrs.indent + delta;
		if (newIndent < 0 || newIndent > maxIndent) return;

		const attrs = { ...block.attrs, indent: newIndent } as Record<
			string,
			string | number | boolean
		>;
		builder.setBlockType(bid, nodeType('list_item'), attrs);
		changed = true;
	});

	if (!changed) return false;

	builder.setSelection(sel);
	context.dispatch(builder.build());
	return true;
}

// --- Checklist Toggle ---

/** Toggles the checked state of a checklist item. Exported for use in checkbox click handler. */
export function toggleChecked(
	context: PluginContext,
	interactiveCheckboxes?: boolean,
	targetId?: BlockId,
): boolean {
	if (context.isReadOnly() && !interactiveCheckboxes) return false;

	const state: EditorState = context.getState();
	const bid: BlockId | null =
		targetId ?? (!isTextSelection(state.selection) ? null : state.selection.anchor.blockId);
	if (!bid) return false;

	const block = state.getBlock(bid);
	if (!block || block.type !== 'list_item' || block.attrs?.listType !== 'checklist') {
		return false;
	}

	const checked: boolean = !block.attrs?.checked;
	const attrs = { ...block.attrs, checked } as Record<string, string | number | boolean>;

	const tr = state
		.transaction('command')
		.setBlockType(bid, nodeType('list_item'), attrs)
		.setSelection(state.selection)
		.build();
	context.dispatch(tr);
	return true;
}

// --- Helpers ---

/** Checks whether all blocks in a range are list items of the given type. Exported for toolbar. */
export function allBlocksMatchListType(
	state: EditorState,
	range: ReturnType<typeof selectionRange>,
	listType: ListType,
): boolean {
	let allMatch = true;
	forEachBlockIdInRange(state, range, (bid: BlockId) => {
		const block = state.getBlock(bid);
		if (!block || block.type !== 'list_item' || block.attrs?.listType !== listType) {
			allMatch = false;
		}
	});
	return allMatch;
}
