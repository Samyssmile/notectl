/**
 * Per-block syntax-token cache for the code-block plugin.
 *
 * Holds the tokens produced by the active {@link SyntaxHighlighter} keyed by
 * block id, re-tokenizing only when a block's text or language changes. Lookups
 * use binary search over the cached, range-ordered token list and never trigger
 * a fresh tokenize.
 */

import type { BlockId } from '../../model/TypeBrands.js';
import type { SyntaxHighlighter, SyntaxToken } from './CodeBlockTypes.js';

interface CacheEntry {
	readonly text: string;
	readonly language: string;
	readonly tokens: readonly SyntaxToken[];
}

export class TokenCache {
	private readonly entries = new Map<BlockId, CacheEntry>();

	/**
	 * Returns the cached tokens for `blockId`, re-tokenizing via `highlighter`
	 * when the block's text or language has changed since the last call.
	 * Returns an empty list when no highlighter is available.
	 */
	getTokens(
		blockId: BlockId,
		text: string,
		language: string,
		highlighter: SyntaxHighlighter | null,
	): readonly SyntaxToken[] {
		const cached: CacheEntry | undefined = this.entries.get(blockId);
		if (cached && cached.text === text && cached.language === language) {
			return cached.tokens;
		}
		const tokens: readonly SyntaxToken[] = highlighter?.tokenize(text, language) ?? [];
		this.entries.set(blockId, { text, language, tokens });
		return tokens;
	}

	/**
	 * Binary-searches the cached token list for the token whose range covers
	 * `offset`. Returns `undefined` on cache miss or if the offset lies in a gap
	 * between tokens.
	 */
	findTokenAt(blockId: BlockId, offset: number): SyntaxToken | undefined {
		const cached: CacheEntry | undefined = this.entries.get(blockId);
		if (!cached) return undefined;
		const tokens: readonly SyntaxToken[] = cached.tokens;
		let low = 0;
		let high = tokens.length - 1;
		while (low <= high) {
			const mid: number = (low + high) >>> 1;
			const token: SyntaxToken | undefined = tokens[mid];
			if (!token) return undefined;
			if (offset < token.from) {
				high = mid - 1;
			} else if (offset >= token.to) {
				low = mid + 1;
			} else {
				return token;
			}
		}
		return undefined;
	}

	/** Drops cache entries whose block id is not in `activeIds`. */
	retain(activeIds: ReadonlySet<BlockId>): void {
		for (const cachedId of this.entries.keys()) {
			if (!activeIds.has(cachedId)) {
				this.entries.delete(cachedId);
			}
		}
	}

	clear(): void {
		this.entries.clear();
	}
}
