/**
 * Keyboard handlers for list block types.
 *
 * Leaf items: Enter splits into a new item (or exits an empty item),
 * Backspace at the start converts back to a paragraph.
 *
 * Container items (#194): the caret sits inside a block child. Enter on an
 * empty trailing child exits into a new sibling item (Enter-Enter continues
 * the list); Backspace at the start of the first child dissolves the item
 * into its children — both mirroring the blockquote container conventions.
 * Everything else falls through to the default split/merge behavior.
 */

import { isEmptyParagraph } from '../../commands/BlockInsertion.js';
import { isNodeOfType } from '../../model/AttrRegistry.js';
import type { BlockNode } from '../../model/Document.js';
import { generateBlockId, getBlockChildren, getBlockText } from '../../model/Document.js';
import { createBlockNode, createTextNode } from '../../model/Document.js';
import { createCollapsedSelection, isCollapsed, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import { buildListItemAttrs } from './ListAttrsFactory.js';
import { type ListItemLocation, dissolveListItem, locateListItem } from './ListItemContext.js';

// --- Context Guard ---

interface ListContext {
	readonly state: EditorState;
	/** The list item owning the caret (the caret block itself for leaf items). */
	readonly item: BlockNode;
	/** The caret's block child of a container item; undefined for leaf items. */
	readonly child: BlockNode | undefined;
	readonly childIndex: number;
	readonly childCount: number;
	readonly blockId: BlockId;
	readonly offset: number;
}

/**
 * Guards against NodeSelection, non-collapsed selections, and carets outside
 * list items. Resolves both leaf items (caret directly inside the item) and
 * container items (caret inside a direct block child of the item).
 */
function withListContext(context: PluginContext, handler: (ctx: ListContext) => boolean): boolean {
	const state: EditorState = context.getState();
	if (!isTextSelection(state.selection)) return false;

	const sel = state.selection;
	if (!isCollapsed(sel)) return false;

	const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
	if (!block) return false;

	if (block.type === 'list_item') {
		return handler({
			state,
			item: block,
			child: undefined,
			childIndex: -1,
			childCount: 0,
			blockId: sel.anchor.blockId,
			offset: sel.anchor.offset,
		});
	}

	const parent: BlockNode | undefined = state.getParent(sel.anchor.blockId);
	if (!parent || parent.type !== 'list_item') return false;
	const children: readonly BlockNode[] = getBlockChildren(parent);
	const childIndex: number = children.findIndex((c) => c.id === block.id);
	if (childIndex < 0) return false;

	return handler({
		state,
		item: parent,
		child: block,
		childIndex,
		childCount: children.length,
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
 * Leaf items: empty → exit list (convert to paragraph); non-empty → split
 * into a new item of the same type.
 * Container items: an empty trailing child exits into a new sibling item;
 * a lone empty child dissolves the item. Everything else falls through to
 * the default split (which grows the item's children).
 */
function handleEnter(context: PluginContext): boolean {
	return withListContext(context, (ctx) => {
		if (ctx.child) return handleEnterInContainerChild(context, ctx, ctx.child);

		const text: string = getBlockText(ctx.item);

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
		const listType = isNodeOfType(ctx.item, 'list_item') ? ctx.item.attrs.listType : 'bullet';
		const indent: number = isNodeOfType(ctx.item, 'list_item') ? ctx.item.attrs.indent : 0;
		const attrs = buildListItemAttrs(listType, indent);

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

/** Enter inside a container item's child: exit on an empty trailing child. */
function handleEnterInContainerChild(
	context: PluginContext,
	ctx: ListContext,
	child: BlockNode,
): boolean {
	if (!isEmptyParagraph(child)) return false;
	if (ctx.childIndex !== ctx.childCount - 1) return false;

	const location: ListItemLocation | undefined = locateListItem(ctx.state, ctx.item.id);
	if (!location) return false;

	const builder = ctx.state.transaction('input');

	if (ctx.childCount === 1) {
		// A lone empty child: the item has no content left — dissolve it and
		// keep the paragraph (same ID, so the caret stays put).
		dissolveListItem(builder, location);
		builder.setSelection(ctx.state.selection);
		context.dispatch(builder.build());
		return true;
	}

	// Drop the empty trailing child and continue the list with a fresh item.
	const listType = isNodeOfType(ctx.item, 'list_item') ? ctx.item.attrs.listType : 'bullet';
	const indent: number = isNodeOfType(ctx.item, 'list_item') ? ctx.item.attrs.indent : 0;
	const newItemId = generateBlockId();
	const newItem: BlockNode = createBlockNode(
		nodeType('list_item'),
		[createTextNode('')],
		newItemId,
		buildListItemAttrs(listType, indent),
	);

	builder
		.removeNode([...location.parentPath, ctx.item.id], ctx.childIndex)
		.insertNode(location.parentPath, location.index + 1, newItem)
		.setSelection(createCollapsedSelection(newItemId, 0));
	context.dispatch(builder.build());
	return true;
}

// --- Backspace Handler ---

/**
 * Handles Backspace at the start of a list item.
 * Leaf items convert back to a paragraph. Container items dissolve into
 * their block children when the caret sits at the very start of the first
 * child (the un-list gesture); later children fall through to the default
 * sibling merge.
 */
function handleBackspace(context: PluginContext): boolean {
	return withListContext(context, (ctx) => {
		if (ctx.offset !== 0) return false;

		if (ctx.child) {
			if (ctx.childIndex !== 0) return false;
			const location: ListItemLocation | undefined = locateListItem(ctx.state, ctx.item.id);
			if (!location) return false;
			const builder = ctx.state.transaction('input');
			dissolveListItem(builder, location);
			builder.setSelection(ctx.state.selection);
			context.dispatch(builder.build());
			return true;
		}

		const tr = ctx.state
			.transaction('input')
			.setBlockType(ctx.blockId, nodeType('paragraph'))
			.setSelection(ctx.state.selection)
			.build();
		context.dispatch(tr);
		return true;
	});
}
