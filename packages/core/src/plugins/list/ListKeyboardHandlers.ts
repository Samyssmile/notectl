/**
 * Keyboard handlers for list block types.
 * Handles Enter (split/exit list) and Backspace (convert to paragraph).
 */

import { isNodeOfType } from '../../model/AttrRegistry.js';
import type { BlockNode } from '../../model/Document.js';
import { generateBlockId, getBlockText } from '../../model/Document.js';
import { createCollapsedSelection, isCollapsed, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';

// --- Context Guard ---

interface ListContext {
	readonly state: EditorState;
	readonly block: BlockNode;
	readonly blockId: BlockId;
	readonly offset: number;
}

/**
 * Guards against NodeSelection, non-collapsed selections, and non-list blocks.
 * Returns false (not handled) if the cursor is not inside a list_item block.
 */
function withListContext(context: PluginContext, handler: (ctx: ListContext) => boolean): boolean {
	const state: EditorState = context.getState();
	if (!isTextSelection(state.selection)) return false;

	const sel = state.selection;
	if (!isCollapsed(sel)) return false;

	const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
	if (!block || block.type !== 'list_item') return false;

	return handler({
		state,
		block,
		blockId: sel.anchor.blockId,
		offset: sel.anchor.offset,
	});
}

/** Registers Enter and Backspace keymaps for list items. */
export function registerListKeymaps(context: PluginContext): void {
	context.registerKeymap({
		Enter: () => handleEnter(context),
		Backspace: () => handleBackspace(context),
	});
}

// --- Enter Handler ---

/**
 * Handles Enter inside a list item.
 * Empty item → exit list (convert to paragraph).
 * Non-empty item → split and create a new list item with the same type.
 */
function handleEnter(context: PluginContext): boolean {
	return withListContext(context, (ctx) => {
		const text: string = getBlockText(ctx.block);

		if (text === '') {
			const tr = ctx.state
				.transaction('input')
				.setBlockType(ctx.blockId, nodeType('paragraph'))
				.setSelection(ctx.state.selection)
				.build();
			context.dispatch(tr);
			return true;
		}

		const newBlockId = generateBlockId();
		const attrs: Record<string, string | number | boolean> = {
			listType: isNodeOfType(ctx.block, 'list_item') ? ctx.block.attrs.listType : 'bullet',
			indent: isNodeOfType(ctx.block, 'list_item') ? ctx.block.attrs.indent : 0,
		};
		if (attrs.listType === 'checklist') {
			attrs.checked = false;
		}

		const tr = ctx.state
			.transaction('input')
			.splitBlock(ctx.blockId, ctx.offset, newBlockId)
			.setBlockType(newBlockId, nodeType('list_item'), attrs)
			.setSelection(createCollapsedSelection(newBlockId, 0))
			.build();
		context.dispatch(tr);
		return true;
	});
}

// --- Backspace Handler ---

/**
 * Handles Backspace at the start of a list item.
 * Converts the list item back to a paragraph, preserving text.
 */
function handleBackspace(context: PluginContext): boolean {
	return withListContext(context, (ctx) => {
		if (ctx.offset !== 0) return false;

		const tr = ctx.state
			.transaction('input')
			.setBlockType(ctx.blockId, nodeType('paragraph'))
			.setSelection(ctx.state.selection)
			.build();
		context.dispatch(tr);
		return true;
	});
}
