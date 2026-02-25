/**
 * Keyboard handlers for heading block types.
 * Handles Enter key behavior: empty heading → paragraph, cursor at end → split + paragraph.
 */

import type { BlockNode } from '../../model/Document.js';
import { generateBlockId, getBlockLength, getBlockText } from '../../model/Document.js';
import {
	createCollapsedSelection,
	isCollapsed,
	isGapCursor,
	isNodeSelection,
} from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import { nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';
import type { HeadingConfig } from './HeadingPlugin.js';

// --- Context Guard ---

const HEADING_TYPES: ReadonlySet<string> = new Set(['heading', 'title', 'subtitle']);

interface HeadingContext {
	readonly state: EditorState;
	readonly block: BlockNode;
	readonly blockId: BlockId;
	readonly offset: number;
}

/**
 * Guards against NodeSelection, non-collapsed selections, and non-heading blocks.
 * Returns false (not handled) if the cursor is not inside a heading-type block.
 */
function withHeadingContext(
	context: PluginContext,
	handler: (ctx: HeadingContext) => boolean,
): boolean {
	const state: EditorState = context.getState();
	if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return false;

	const sel = state.selection;
	if (!isCollapsed(sel)) return false;

	const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
	if (!block || !HEADING_TYPES.has(block.type)) return false;

	return handler({
		state,
		block,
		blockId: sel.anchor.blockId,
		offset: sel.anchor.offset,
	});
}

/** Registers all heading keyboard handlers (Enter, Mod-Shift-N shortcuts). */
export function registerHeadingKeymaps(context: PluginContext, config: HeadingConfig): void {
	const keymap: Record<string, () => boolean> = {
		Enter: () => handleEnter(context),
	};

	for (const level of config.levels) {
		if (level <= 6) {
			keymap[`Mod-Shift-${level}`] = () => context.executeCommand(`setHeading${level}`);
		}
	}

	context.registerKeymap(keymap);
}

// --- Enter Handler ---

/**
 * Handles Enter inside a heading block.
 * Empty heading → convert to paragraph.
 * Cursor at end → split and convert new block to paragraph.
 * Cursor in middle → normal split (both stay heading).
 */
function handleEnter(context: PluginContext): boolean {
	return withHeadingContext(context, (ctx) => {
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

		const blockLength: number = getBlockLength(ctx.block);

		if (ctx.offset >= blockLength) {
			const newBlockId = generateBlockId();
			const tr = ctx.state
				.transaction('input')
				.splitBlock(ctx.blockId, ctx.offset, newBlockId)
				.setBlockType(newBlockId, nodeType('paragraph'))
				.setSelection(createCollapsedSelection(newBlockId, 0))
				.build();
			context.dispatch(tr);
			return true;
		}

		return false;
	});
}
