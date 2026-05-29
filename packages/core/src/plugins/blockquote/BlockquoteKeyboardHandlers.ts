/**
 * Keyboard handlers for the blockquote container (issue #136, B2 model).
 *
 * Under the container model the caret lives in a child block of the blockquote,
 * not in the blockquote itself. These handlers manage the two container
 * boundaries; everything in between (splitting, merging, arrow navigation) is
 * left to the default commands, which already operate correctly on the nested
 * child blocks:
 *
 *  - Enter in an empty last child  → exit the blockquote (paragraph after it).
 *  - Backspace at start of the first child → lift that child out of the quote.
 *
 * List items are deferred to the list plugin's own handlers.
 */

import type { BlockNode } from '../../model/Document.js';
import { createEmptyParagraph, getBlockChildren, getBlockLength } from '../../model/Document.js';
import { resolveParentByPath } from '../../model/NodeResolver.js';
import { createCollapsedSelection, isCollapsed, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';

// --- Context Guard ---

interface QuoteChildContext {
	readonly state: EditorState;
	readonly quotePath: readonly BlockId[];
	readonly quoteParentPath: readonly BlockId[];
	readonly quoteIndex: number;
	readonly child: BlockNode;
	readonly childIndex: number;
	readonly childCount: number;
	readonly offset: number;
}

/**
 * Resolves the caret context when the cursor sits in a direct child of a
 * blockquote. Returns false (not handled) otherwise, so the default keymap and
 * other plugins keep their behavior.
 */
function withBlockquoteChildContext(
	context: PluginContext,
	handler: (ctx: QuoteChildContext) => boolean,
): boolean {
	const state: EditorState = context.getState();
	if (!isTextSelection(state.selection)) return false;
	const sel = state.selection;
	if (!isCollapsed(sel)) return false;

	const childId: BlockId = sel.anchor.blockId;
	const quote: BlockNode | undefined = state.getParent(childId);
	if (!quote || quote.type !== 'blockquote') return false;

	const child: BlockNode | undefined = state.getBlock(childId);
	if (!child) return false;

	const quotePath: BlockId[] | undefined = state.getNodePath(quote.id);
	if (!quotePath) return false;
	const parentRef = resolveParentByPath(state.doc, quotePath);
	if (!parentRef) return false;

	const children: readonly BlockNode[] = getBlockChildren(quote);
	const childIndex: number = children.findIndex((b) => b.id === childId);
	if (childIndex < 0) return false;

	return handler({
		state,
		quotePath,
		quoteParentPath: quotePath.slice(0, -1),
		quoteIndex: parentRef.index,
		child,
		childIndex,
		childCount: children.length,
		offset: sel.anchor.offset,
	});
}

/** Registers the blockquote container keyboard handlers at context priority. */
export function registerBlockquoteKeymaps(context: PluginContext): void {
	context.registerKeymap(
		{
			Enter: () => handleEnterExit(context),
			Backspace: () => handleBackspaceLift(context),
		},
		{ priority: 'context' },
	);
}

// --- Handlers ---

/**
 * Enter in an empty last child of the blockquote exits the container: a fresh
 * paragraph is created after the quote (or, when that child is the quote's only
 * child, the quote dissolves into that paragraph). Any other case returns false
 * so the default splitBlock creates a new line inside the quote.
 */
function handleEnterExit(context: PluginContext): boolean {
	return withBlockquoteChildContext(context, (ctx) => {
		if (ctx.child.type === 'list_item') return false;
		const isLast: boolean = ctx.childIndex === ctx.childCount - 1;
		if (!isLast || getBlockLength(ctx.child) > 0) return false;

		const paragraph: BlockNode = createEmptyParagraph();
		const builder = ctx.state.transaction('input');

		if (ctx.childCount === 1) {
			// Sole child: dissolve the quote, replacing it with the paragraph.
			builder.removeNode(ctx.quoteParentPath, ctx.quoteIndex);
			builder.insertNode(ctx.quoteParentPath, ctx.quoteIndex, paragraph);
		} else {
			// Drop the empty trailing child and continue after the quote.
			builder.removeNode(ctx.quotePath, ctx.childIndex);
			builder.insertNode(ctx.quoteParentPath, ctx.quoteIndex + 1, paragraph);
		}

		builder.setSelection(createCollapsedSelection(paragraph.id, 0));
		context.dispatch(builder.build());
		return true;
	});
}

/**
 * Backspace at the start of the blockquote's first child lifts that child out of
 * the quote (placing it directly before the quote, or dissolving the quote when
 * it was the only child). Inner children at offset 0 fall through to the default
 * merge, which joins adjacent siblings within the quote.
 */
function handleBackspaceLift(context: PluginContext): boolean {
	return withBlockquoteChildContext(context, (ctx) => {
		if (ctx.offset !== 0 || ctx.childIndex !== 0) return false;
		if (ctx.child.type === 'list_item') return false;

		const builder = ctx.state.transaction('input');

		if (ctx.childCount === 1) {
			// Sole child: dissolve the quote, the child takes its place.
			builder.removeNode(ctx.quoteParentPath, ctx.quoteIndex);
			builder.insertNode(ctx.quoteParentPath, ctx.quoteIndex, ctx.child);
		} else {
			// Lift the first child out, immediately before the quote.
			builder.removeNode(ctx.quotePath, 0);
			builder.insertNode(ctx.quoteParentPath, ctx.quoteIndex, ctx.child);
		}

		builder.setSelection(createCollapsedSelection(ctx.child.id, 0));
		context.dispatch(builder.build());
		return true;
	});
}
