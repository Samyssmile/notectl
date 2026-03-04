/**
 * Shared helper utilities for plugins.
 * Common operations extracted to avoid code duplication across plugins.
 */

import { LocaleServiceKey } from '../../i18n/LocaleService.js';
import type { BlockNode } from '../../model/Document.js';
import { isNodeSelection, isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { PluginContext } from '../Plugin.js';

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
