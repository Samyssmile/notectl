/**
 * Command registration and implementations for heading block types.
 * Handles toggle between heading/title/subtitle and paragraph,
 * plus excluded-mark stripping when switching block types.
 */

import type { BlockNode, Mark } from '../../model/Document.js';
import { getBlockLength, getInlineChildren, isTextNode } from '../../model/Document.js';
import { isGapCursor, isNodeSelection } from '../../model/Selection.js';
import { type NodeTypeName, nodeType } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { TransactionBuilder } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';
import type { HeadingConfig, HeadingLevel } from './HeadingPlugin.js';

/** Registers all heading commands (setTitle, setSubtitle, setHeadingN, toggleHeading, setParagraph). */
export function registerHeadingCommands(context: PluginContext, config: HeadingConfig): void {
	context.registerCommand('setTitle', () => toggleSpecialBlock(context, 'title'));

	context.registerCommand('setSubtitle', () => toggleSpecialBlock(context, 'subtitle'));

	for (const level of config.levels) {
		context.registerCommand(`setHeading${level}`, () => toggleHeading(context, level));
	}

	context.registerCommand('toggleHeading', () => toggleHeading(context, 1));

	context.registerCommand('setParagraph', () => setBlockType(context, nodeType('paragraph')));
}

// --- Command Implementations ---

/**
 * Toggles between a special block type (title/subtitle) and paragraph.
 * If the block is already that type, resets to paragraph.
 */
function toggleSpecialBlock(context: PluginContext, type: string): boolean {
	const state: EditorState = context.getState();
	if (isNodeSelection(state.selection) || isGapCursor(state.selection)) return false;

	const block: BlockNode | undefined = state.getBlock(state.selection.anchor.blockId);
	if (!block) return false;

	if (block.type === type) {
		return setBlockType(context, nodeType('paragraph'));
	}

	return setBlockType(context, nodeType(type) as NodeTypeName);
}

/**
 * Toggles between heading (at given level) and paragraph.
 * If the block is already a heading at the same level, resets to paragraph.
 */
function toggleHeading(context: PluginContext, level: HeadingLevel): boolean {
	const state: EditorState = context.getState();
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return false;

	const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
	if (!block) return false;

	if (block.type === 'heading' && block.attrs?.level === level) {
		return setBlockType(context, nodeType('paragraph'));
	}

	return setBlockType(context, nodeType('heading'), { level });
}

function setBlockType(
	context: PluginContext,
	type: NodeTypeName,
	attrs?: Record<string, string | number | boolean>,
): boolean {
	const state: EditorState = context.getState();
	const sel = state.selection;
	if (isNodeSelection(sel) || isGapCursor(sel)) return false;

	const block: BlockNode | undefined = state.getBlock(sel.anchor.blockId);
	if (!block) return false;

	const builder: TransactionBuilder = state.transaction('command');

	const spec = context.getSchemaRegistry().getNodeSpec(type);
	if (spec?.excludeMarks && spec.excludeMarks.length > 0) {
		stripExcludedMarks(builder, block, spec.excludeMarks);
		clearExcludedStoredMarks(builder, state, spec.excludeMarks);
	}

	const tr = builder.setBlockType(sel.anchor.blockId, type, attrs).setSelection(sel).build();
	context.dispatch(tr);
	return true;
}

// --- Mark Stripping Helpers ---

/**
 * Adds removeMark steps for each excluded mark type found
 * on the block's inline text content.
 */
function stripExcludedMarks(
	builder: TransactionBuilder,
	block: BlockNode,
	excludeMarks: readonly string[],
): void {
	const blockLength: number = getBlockLength(block);
	if (blockLength === 0) return;

	const excludeSet: Set<string> = new Set(excludeMarks);
	const inlineChildren = getInlineChildren(block);
	let offset = 0;

	for (const child of inlineChildren) {
		if (isTextNode(child)) {
			if (child.text.length > 0) {
				for (const mark of child.marks) {
					if (excludeSet.has(mark.type)) {
						builder.removeMark(block.id, offset, offset + child.text.length, mark);
					}
				}
			}
			offset += child.text.length;
		} else {
			offset += 1;
		}
	}
}

/**
 * Clears excluded mark types from stored marks so that
 * subsequent typing does not reintroduce them.
 */
function clearExcludedStoredMarks(
	builder: TransactionBuilder,
	state: EditorState,
	excludeMarks: readonly string[],
): void {
	if (!state.storedMarks) return;

	const excludeSet: Set<string> = new Set(excludeMarks);
	const filtered: readonly Mark[] = state.storedMarks.filter((m: Mark) => !excludeSet.has(m.type));

	if (filtered.length !== state.storedMarks.length) {
		builder.setStoredMarks(filtered.length > 0 ? filtered : null, state.storedMarks);
	}
}
