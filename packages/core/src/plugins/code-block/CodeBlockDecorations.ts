/**
 * Builds the decoration set for code blocks: a focus highlight on the block
 * containing the caret plus per-token syntax-highlight decorations sourced from
 * the {@link TokenCache}.
 */

import type { Decoration } from '../../decorations/Decoration.js';
import {
	DecorationSet,
	inline as inlineDecoration,
	node as nodeDecoration,
} from '../../decorations/Decoration.js';
import type { BlockNode } from '../../model/Document.js';
import { getBlockText } from '../../model/Document.js';
import { isTextSelection } from '../../model/Selection.js';
import type { BlockId } from '../../model/TypeBrands.js';
import type { EditorState } from '../../state/EditorState.js';
import type { SyntaxHighlighter, SyntaxToken } from './CodeBlockTypes.js';
import type { TokenCache } from './TokenCache.js';

interface CodeBlockDecorationDeps {
	readonly highlighter: SyntaxHighlighter | null;
	readonly tokenCache: TokenCache;
}

/**
 * Produces the focus + syntax-highlight decorations for all code blocks in
 * `state`. As a side effect, prunes cache entries for blocks that no longer
 * carry highlightable content so the cache tracks the live document.
 */
export function createCodeBlockDecorations(
	state: EditorState,
	deps: CodeBlockDecorationDeps,
): DecorationSet {
	const decorations: Decoration[] = [];

	const focusedBlockId: BlockId | null = getFocusedCodeBlockId(state);
	if (focusedBlockId) {
		decorations.push(nodeDecoration(focusedBlockId, { class: 'notectl-code-block--focused' }));
	}

	if (deps.highlighter) {
		const activeBlockIds = new Set<BlockId>();
		for (const bid of state.getBlockOrder()) {
			const block: BlockNode | undefined = state.getBlock(bid);
			if (!block || block.type !== 'code_block') continue;

			const lang: string = (block.attrs?.language as string) ?? '';
			if (!lang) continue;

			const text: string = getBlockText(block);
			if (!text) continue;

			activeBlockIds.add(bid);
			const tokens: readonly SyntaxToken[] = deps.tokenCache.getTokens(
				bid,
				text,
				lang,
				deps.highlighter,
			);
			for (const token of tokens) {
				decorations.push(
					inlineDecoration(bid, token.from, token.to, {
						class: `notectl-token--${token.type}`,
					}),
				);
			}
		}

		deps.tokenCache.retain(activeBlockIds);
	}

	if (decorations.length === 0) return DecorationSet.empty;
	return DecorationSet.create(decorations);
}

function getFocusedCodeBlockId(state: EditorState): BlockId | null {
	if (!isTextSelection(state.selection)) return null;
	const blockId: BlockId = state.selection.anchor.blockId;
	const block: BlockNode | undefined = state.getBlock(blockId);
	if (block?.type === 'code_block') return blockId;
	return null;
}
