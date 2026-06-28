/**
 * Shared helper utilities for plugins.
 * Common operations extracted to avoid code duplication across plugins.
 */

import { LocaleServiceKey } from '../../i18n/LocaleService.js';
import type { BlockNode } from '../../model/Document.js';
import { isNodeSelection, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { Transaction } from '../../state/Transaction.js';
import type { PluginContext } from '../Plugin.js';

/**
 * Dispatches `tr` when it is non-null and reports whether anything happened.
 * Collapses the command body `if (tr) { dispatch(tr); return true; } return false;`
 * shared by mark toggle commands and attributed-mark operations into a single
 * call: `return dispatchIfPresent(context, tr);`.
 */
export function dispatchIfPresent(context: PluginContext, tr: Transaction | null): boolean {
	if (!tr) return false;
	context.dispatch(tr);
	return true;
}

/** Capitalizes the first character of a string. */
export function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Converts a mark type to its toggle command name (e.g. 'bold' → 'toggleBold'). */
export function toCommandName(markType: string): string {
	return `toggle${capitalize(markType)}`;
}

/**
 * Resolves the locale for a plugin, using config override, default, or dynamic loader.
 * Plugins provide their config locale, a default English locale, and a loader for other languages.
 */
export async function resolveLocale<T>(
	context: PluginContext,
	configLocale: T | undefined,
	defaultLocale: T,
	loader: (lang: string) => Promise<T>,
): Promise<T> {
	if (configLocale) return configLocale;
	const service = context.getService(LocaleServiceKey);
	const lang: string = service?.getLocale() ?? 'en';
	return lang === 'en' ? defaultLocale : loader(lang);
}

/** Returns the block under the cursor, handling both TextSelection and NodeSelection. */
export function getSelectedBlock(state: EditorState): BlockNode | undefined {
	const sel = state.selection;
	if (isNodeSelection(sel)) return state.getBlock(sel.nodeId);
	if (isTextSelection(sel)) return state.getBlock(sel.anchor.blockId);
	return undefined;
}

/** Returns the block ID under the cursor, handling both TextSelection and NodeSelection. */
export function getSelectedBlockId(state: EditorState): BlockId | undefined {
	const sel = state.selection;
	if (isNodeSelection(sel)) return sel.nodeId;
	if (isTextSelection(sel)) return sel.anchor.blockId;
	return undefined;
}

/**
 * Returns every leaf-block ID covered by the current selection, in document
 * order. A NodeSelection yields its single node; a collapsed or single-block
 * TextSelection yields one ID; a multi-block TextSelection yields the full
 * inclusive range from anchor to head. Used by block-attribute commands
 * (alignment, text direction) that must apply to the whole selection.
 */
export function getSelectedBlockIds(state: EditorState): BlockId[] {
	const sel = state.selection;

	if (isNodeSelection(sel)) return [sel.nodeId];
	if (!isTextSelection(sel)) return [];

	const anchorId: BlockId = sel.anchor.blockId;
	const headId: BlockId = sel.head.blockId;
	if (anchorId === headId) return [anchorId];

	const order: readonly BlockId[] = state.getBlockOrder();
	const anchorIdx: number = order.indexOf(anchorId);
	const headIdx: number = order.indexOf(headId);
	if (anchorIdx === -1 || headIdx === -1) return [];

	const from: number = Math.min(anchorIdx, headIdx);
	const to: number = Math.max(anchorIdx, headIdx);
	return order.slice(from, to + 1) as BlockId[];
}
