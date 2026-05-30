import { describe, expect, it, vi } from 'vitest';
import type { BlockId } from '../../model/TypeBrands.js';
import { blockId } from '../../model/TypeBrands.js';
import type { SyntaxHighlighter, SyntaxToken } from './CodeBlockTypes.js';
import { TokenCache } from './TokenCache.js';

function fakeHighlighter(tokens: readonly SyntaxToken[]): SyntaxHighlighter {
	return {
		tokenize: vi.fn(() => tokens),
		getSupportedLanguages: () => ['ts'],
	};
}

const b1: BlockId = blockId('b1');
const b2: BlockId = blockId('b2');

describe('TokenCache', () => {
	describe('getTokens', () => {
		it('tokenizes on first call and caches by text + language', () => {
			const tokens: SyntaxToken[] = [{ from: 0, to: 3, type: 'keyword' }];
			const highlighter = fakeHighlighter(tokens);
			const cache = new TokenCache();

			const first = cache.getTokens(b1, 'let', 'ts', highlighter);
			const second = cache.getTokens(b1, 'let', 'ts', highlighter);

			expect(first).toBe(tokens);
			expect(second).toBe(tokens);
			expect(highlighter.tokenize).toHaveBeenCalledTimes(1);
		});

		it('re-tokenizes when text changes', () => {
			const highlighter = fakeHighlighter([{ from: 0, to: 1, type: 'x' }]);
			const cache = new TokenCache();

			cache.getTokens(b1, 'a', 'ts', highlighter);
			cache.getTokens(b1, 'ab', 'ts', highlighter);

			expect(highlighter.tokenize).toHaveBeenCalledTimes(2);
		});

		it('re-tokenizes when language changes', () => {
			const highlighter = fakeHighlighter([{ from: 0, to: 1, type: 'x' }]);
			const cache = new TokenCache();

			cache.getTokens(b1, 'a', 'ts', highlighter);
			cache.getTokens(b1, 'a', 'js', highlighter);

			expect(highlighter.tokenize).toHaveBeenCalledTimes(2);
		});

		it('returns an empty list when no highlighter is available', () => {
			const cache = new TokenCache();
			expect(cache.getTokens(b1, 'code', 'ts', null)).toEqual([]);
		});
	});

	describe('findTokenAt', () => {
		const tokens: SyntaxToken[] = [
			{ from: 0, to: 3, type: 'a' },
			{ from: 5, to: 8, type: 'b' },
			{ from: 8, to: 10, type: 'c' },
		];

		function seeded(): TokenCache {
			const cache = new TokenCache();
			cache.getTokens(b1, 'x', 'ts', fakeHighlighter(tokens));
			return cache;
		}

		it('finds the token covering an offset (inclusive start, exclusive end)', () => {
			const cache = seeded();
			expect(cache.findTokenAt(b1, 0)?.type).toBe('a');
			expect(cache.findTokenAt(b1, 2)?.type).toBe('a');
			expect(cache.findTokenAt(b1, 5)?.type).toBe('b');
			expect(cache.findTokenAt(b1, 8)?.type).toBe('c');
		});

		it('returns undefined for an offset in a gap between tokens', () => {
			const cache = seeded();
			expect(cache.findTokenAt(b1, 3)).toBeUndefined();
			expect(cache.findTokenAt(b1, 4)).toBeUndefined();
		});

		it('returns undefined past the last token and on cache miss', () => {
			const cache = seeded();
			expect(cache.findTokenAt(b1, 10)).toBeUndefined();
			expect(cache.findTokenAt(b2, 0)).toBeUndefined();
		});
	});

	describe('retain', () => {
		it('drops entries whose block id is not retained', () => {
			const highlighter = fakeHighlighter([{ from: 0, to: 1, type: 'x' }]);
			const cache = new TokenCache();
			cache.getTokens(b1, 'a', 'ts', highlighter);
			cache.getTokens(b2, 'a', 'ts', highlighter);

			cache.retain(new Set<BlockId>([b1]));

			// b1 is still cached (no re-tokenize); b2 was purged (re-tokenizes).
			cache.getTokens(b1, 'a', 'ts', highlighter);
			cache.getTokens(b2, 'a', 'ts', highlighter);
			// b1: 1 initial, b2: 1 initial + 1 after purge = 3 total.
			expect(highlighter.tokenize).toHaveBeenCalledTimes(3);
		});
	});

	describe('clear', () => {
		it('empties the cache', () => {
			const highlighter = fakeHighlighter([{ from: 0, to: 1, type: 'x' }]);
			const cache = new TokenCache();
			cache.getTokens(b1, 'a', 'ts', highlighter);

			cache.clear();

			cache.getTokens(b1, 'a', 'ts', highlighter);
			expect(highlighter.tokenize).toHaveBeenCalledTimes(2);
		});
	});
});
