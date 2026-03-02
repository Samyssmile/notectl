/**
 * Direction detection utilities for the TextDirectionPlugin.
 * Detects text direction based on the first strong directional character
 * and finds sibling block direction for inheritance.
 */

import { type BlockNode, isBlockNode } from '../../model/Document.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { TextDirection } from './TextDirectionPlugin.js';

// --- RTL Detection ---

/**
 * Regex matching strong RTL characters using Unicode Script property escapes.
 * Auto-maintained by the Unicode standard — no manual code-point ranges needed.
 * Covers all RTL scripts: Hebrew, Arabic, Syriac, Thaana, N'Ko, Samaritan,
 * Mandaic, Adlam, Hanifi Rohingya, Mende Kikakui, Yezidi, and historic scripts.
 * Includes U+200F (RLM) and U+061C (ALM) as strong directional markers.
 */
const RTL_CHAR_RE: RegExp =
	/[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Mandaic}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Mende_Kikakui}\p{Script=Yezidi}\p{Script=Old_South_Arabian}\p{Script=Old_North_Arabian}\p{Script=Avestan}\p{Script=Imperial_Aramaic}\p{Script=Phoenician}\p{Script=Lydian}\u200F\u061C]/u;

/**
 * Regex matching strong LTR characters using Unicode Script property escapes.
 * Covers all major LTR scripts: Latin, Greek, Cyrillic, Armenian, Indic scripts,
 * Southeast Asian scripts, East Asian scripts, Georgian, Ethiopic, and more.
 * Includes U+200E (LRM) as a strong directional marker.
 */
const LTR_CHAR_RE: RegExp =
	/[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Armenian}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Thai}\p{Script=Lao}\p{Script=Tibetan}\p{Script=Myanmar}\p{Script=Georgian}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Ethiopic}\p{Script=Cherokee}\p{Script=Khmer}\u200E]/u;

/**
 * Detects the dominant text direction based on the first strong directional character.
 * Returns `null` if no strong character is found (all neutral/numeric/whitespace).
 */
export function detectTextDirection(text: string): TextDirection | null {
	const rtlIdx: number = text.search(RTL_CHAR_RE);
	const ltrIdx: number = text.search(LTR_CHAR_RE);

	if (rtlIdx === -1 && ltrIdx === -1) return null;
	if (rtlIdx === -1) return 'ltr';
	if (ltrIdx === -1) return 'rtl';
	return rtlIdx < ltrIdx ? 'rtl' : 'ltr';
}

// --- Block Direction Accessor ---

/** Returns the current `dir` attribute of a block, defaulting to `'auto'`. */
export function getBlockDir(block: BlockNode): TextDirection {
	const dir: unknown = block.attrs?.dir;
	if (dir === 'ltr' || dir === 'rtl') return dir;
	return 'auto';
}

// --- Sibling Direction Lookup ---

/**
 * Finds the `dir` attribute of the nearest sibling with an explicit direction
 * (not `'auto'`) before the insert position, walking backwards.
 */
export function findSiblingDirection(
	state: EditorState,
	parentPath: readonly BlockId[],
	index: number,
): TextDirection | undefined {
	const siblings: readonly BlockNode[] = getSiblings(state, parentPath);

	// Walk backward first (preceding siblings take priority)
	for (let i: number = index - 1; i >= 0; i--) {
		const dir: unknown = siblings[i]?.attrs?.dir;
		if (dir === 'ltr' || dir === 'rtl') return dir;
	}

	// Walk forward when no backward sibling has explicit direction
	for (let i: number = index; i < siblings.length; i++) {
		const dir: unknown = siblings[i]?.attrs?.dir;
		if (dir === 'ltr' || dir === 'rtl') return dir;
	}

	return undefined;
}

/** Returns the sibling list for the given parent path. */
function getSiblings(state: EditorState, parentPath: readonly BlockId[]): readonly BlockNode[] {
	if (parentPath.length === 0) {
		return state.doc.children;
	}

	const parentId: BlockId | undefined = parentPath[parentPath.length - 1];
	if (!parentId) return [];
	const parent: BlockNode | undefined = state.getBlock(parentId);
	if (!parent) return [];

	return parent.children.filter(isBlockNode);
}
