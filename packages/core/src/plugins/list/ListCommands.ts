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
import { buildListItemAttrs } from './ListAttrsFactory.js';
import type { ListTypeDefinition } from './ListDefinitions.js';
import type { ListLocale } from './ListLocale.js';
import type { ListConfig, ListType } from './ListPlugin.js';

/** Registers all list commands (toggleList:*, indent, outdent, toggleChecklistItem). */
export function registerListCommands(
	context: PluginContext,
	config: ListConfig,
	enabledTypes: readonly ListTypeDefinition[],
	locale: ListLocale,
): void {
	for (const def of enabledTypes) {
		context.registerCommand(`toggleList:${def.type}`, () => {
			return toggleList(context, def.type);
		});
	}

	context.registerCommand('indentListItem', () => changeIndent(context, 1, config.maxIndent));

	context.registerCommand('outdentListItem', () => changeIndent(context, -1, config.maxIndent));

	if (config.types.includes('checklist')) {
		const toggleChecklistItem = (): boolean =>
			toggleChecked(context, { interactiveCheckboxes: config.interactiveCheckboxes, locale });

		context.registerCommand('toggleChecklistItem', toggleChecklistItem, {
			readonlyAllowed: true,
		});

		// Mod-Enter gives keyboard-only users a way to toggle a checklist item
		// (WCAG 2.1.1). The handler declines on non-checklist blocks, so it falls
		// through to other Mod-Enter bindings (e.g. code-block insert-after).
		// Registered at navigation priority so it stays reachable in read-only mode
		// when interactiveCheckboxes is enabled, matching the mouse handler.
		context.registerKeymap({ 'Mod-Enter': toggleChecklistItem }, { priority: 'navigation' });
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

	const existingIndent: number = isNodeOfType(block, 'list_item') ? block.attrs.indent : 0;
	const attrs = buildListItemAttrs(listType, existingIndent);

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
			const existingIndent: number = isNodeOfType(block, 'list_item') ? block.attrs.indent : 0;
			const existingChecked: boolean =
				isNodeOfType(block, 'list_item') &&
				block.attrs.listType === 'checklist' &&
				block.attrs.checked;
			builder.setBlockType(
				bid,
				nodeType('list_item'),
				buildListItemAttrs(listType, existingIndent, existingChecked),
			);
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

	const attrs = buildListItemAttrs(block.attrs.listType, newIndent, block.attrs.checked);
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

		builder.setBlockType(
			bid,
			nodeType('list_item'),
			buildListItemAttrs(block.attrs.listType, newIndent, block.attrs.checked),
		);
		changed = true;
	});

	if (!changed) return false;

	builder.setSelection(sel);
	context.dispatch(builder.build());
	return true;
}

// --- Checklist Toggle ---

/** Options for {@link toggleChecked}. */
export interface ToggleCheckedOptions {
	/** When true, the toggle is allowed even in read-only mode. */
	readonly interactiveCheckboxes?: boolean;
	/** Specific checklist item to toggle. Defaults to the selection's block. */
	readonly targetId?: BlockId;
	/** Locale used for the screen-reader announcement of the new state. */
	readonly locale: ListLocale;
}

/**
 * Toggles the checked state of a checklist item and announces the new state to
 * screen readers. Exported for use in the checkbox click handler.
 */
export function toggleChecked(context: PluginContext, options: ToggleCheckedOptions): boolean {
	const { interactiveCheckboxes, targetId, locale } = options;
	if (context.isReadOnly() && !interactiveCheckboxes) return false;

	const state: EditorState = context.getState();
	const bid: BlockId | null =
		targetId ?? (!isTextSelection(state.selection) ? null : state.selection.anchor.blockId);
	if (!bid) return false;

	const block = state.getBlock(bid);
	if (!block || !isNodeOfType(block, 'list_item') || block.attrs.listType !== 'checklist') {
		return false;
	}

	const nextChecked: boolean = !block.attrs.checked;
	const attrs = buildListItemAttrs(block.attrs.listType, block.attrs.indent, nextChecked);

	const tr = state
		.transaction('command')
		.setBlockType(bid, nodeType('list_item'), attrs)
		.setSelection(state.selection)
		.build();
	context.dispatch(tr);

	// The marker is not focused while editing, so the aria-checked change alone is
	// not spoken — announce the new state explicitly (WCAG 4.1.3).
	context.announce(nextChecked ? locale.checkedAnnouncement : locale.uncheckedAnnouncement);
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
