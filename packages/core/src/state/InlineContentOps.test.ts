import { describe, expect, it } from 'vitest';
import { createInlineNode, createTextNode, isInlineNode, isTextNode } from '../model/Document.js';
import type { InlineNode, Mark, TextNode } from '../model/Document.js';
import { inlineType, markType } from '../model/TypeBrands.js';
import {
	applyMarkToInlineContent,
	deleteFromInlineContent,
	findRangesMissingMark,
	findRangesWithMark,
	insertInlineNodeAtOffset,
	insertSegmentsIntoInlineContent,
	insertTextIntoInlineContent,
	removeInlineNodeAtOffset,
	replaceInlineChildren,
	setInlineNodeAttrsAtOffset,
	sliceInlineContent,
} from './InlineContentOps.js';

const bold: Mark = { type: markType('bold') };
const italic: Mark = { type: markType('italic') };
const emoji: InlineNode = createInlineNode(inlineType('emoji'), { name: 'smile' });

function text(str: string, marks: readonly Mark[] = []): TextNode {
	return createTextNode(str, marks);
}

describe('InlineContentOps', () => {
	describe('insertTextIntoInlineContent', () => {
		it('inserts into empty content', () => {
			const result: (TextNode | InlineNode)[] = insertTextIntoInlineContent([], 0, 'hello', []);
			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({ type: 'text', text: 'hello' });
		});

		it('inserts at the start of a text node', () => {
			const result: (TextNode | InlineNode)[] = insertTextIntoInlineContent(
				[text('world')],
				0,
				'hello ',
				[],
			);
			expect(result).toHaveLength(2);
			expect(result[0]).toMatchObject({ text: 'hello ' });
			expect(result[1]).toMatchObject({ text: 'world' });
		});

		it('inserts in the middle of a text node', () => {
			const result: (TextNode | InlineNode)[] = insertTextIntoInlineContent(
				[text('helo')],
				2,
				'l',
				[],
			);
			expect(result).toHaveLength(3);
			expect(result[0]).toMatchObject({ text: 'he' });
			expect(result[1]).toMatchObject({ text: 'l' });
			expect(result[2]).toMatchObject({ text: 'lo' });
		});

		it('inserts at the end of a text node', () => {
			const result: (TextNode | InlineNode)[] = insertTextIntoInlineContent(
				[text('hello')],
				5,
				'!',
				[],
			);
			expect(result).toHaveLength(2);
			expect(result[0]).toMatchObject({ text: 'hello' });
			expect(result[1]).toMatchObject({ text: '!' });
		});

		it('inserts with marks', () => {
			const result: (TextNode | InlineNode)[] = insertTextIntoInlineContent(
				[text('hello')],
				5,
				' world',
				[bold],
			);
			expect(result[1]).toMatchObject({ text: ' world', marks: [bold] });
		});

		it('inserts before an InlineNode', () => {
			const result: (TextNode | InlineNode)[] = insertTextIntoInlineContent([emoji], 0, 'hi', []);
			expect(result).toHaveLength(2);
			const first: TextNode | InlineNode | undefined = result[0];
			const second: TextNode | InlineNode | undefined = result[1];
			if (!first || !second) return;
			expect(isTextNode(first)).toBe(true);
			expect(isInlineNode(second)).toBe(true);
		});
	});

	describe('insertSegmentsIntoInlineContent', () => {
		it('inserts multiple segments at an offset', () => {
			const result: (TextNode | InlineNode)[] = insertSegmentsIntoInlineContent(
				[text('hello')],
				5,
				[
					{ text: ' bold', marks: [bold] },
					{ text: ' plain', marks: [] },
				],
			);
			expect(result).toHaveLength(3);
			expect(result[1]).toMatchObject({ text: ' bold', marks: [bold] });
			expect(result[2]).toMatchObject({ text: ' plain', marks: [] });
		});

		it('inserts segments into empty content', () => {
			const result: (TextNode | InlineNode)[] = insertSegmentsIntoInlineContent([], 0, [
				{ text: 'a', marks: [] },
			]);
			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({ text: 'a' });
		});

		it('inserts segments before an InlineNode', () => {
			const result: (TextNode | InlineNode)[] = insertSegmentsIntoInlineContent([emoji], 0, [
				{ text: 'before', marks: [] },
			]);
			expect(result).toHaveLength(2);
			const first: TextNode | InlineNode | undefined = result[0];
			const second: TextNode | InlineNode | undefined = result[1];
			if (!first || !second) return;
			expect(isTextNode(first)).toBe(true);
			expect(isInlineNode(second)).toBe(true);
		});
	});

	describe('deleteFromInlineContent', () => {
		it('deletes a range from a text node', () => {
			const result: (TextNode | InlineNode)[] = deleteFromInlineContent([text('hello')], 1, 4);
			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({ text: 'ho' });
		});

		it('deletes an entire text node', () => {
			const result: (TextNode | InlineNode)[] = deleteFromInlineContent([text('hello')], 0, 5);
			expect(result).toHaveLength(0);
		});

		it('deletes an InlineNode within the range', () => {
			const result: (TextNode | InlineNode)[] = deleteFromInlineContent(
				[text('ab'), emoji, text('cd')],
				2,
				3,
			);
			expect(result).toHaveLength(2);
			expect(result.every((n) => isTextNode(n))).toBe(true);
		});

		it('preserves InlineNode outside the range', () => {
			const result: (TextNode | InlineNode)[] = deleteFromInlineContent(
				[text('ab'), emoji, text('cd')],
				0,
				1,
			);
			expect(result).toHaveLength(3);
			expect(result[0]).toMatchObject({ text: 'b' });
			const mid: TextNode | InlineNode | undefined = result[1];
			if (!mid) return;
			expect(isInlineNode(mid)).toBe(true);
		});
	});

	describe('sliceInlineContent', () => {
		it('slices a range from text content', () => {
			const result: (TextNode | InlineNode)[] = sliceInlineContent([text('hello')], 1, 4);
			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({ text: 'ell' });
		});

		it('returns empty text node for empty slice', () => {
			const result: (TextNode | InlineNode)[] = sliceInlineContent([text('hello')], 3, 3);
			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({ text: '' });
		});

		it('includes InlineNode within range', () => {
			const result: (TextNode | InlineNode)[] = sliceInlineContent(
				[text('ab'), emoji, text('cd')],
				1,
				4,
			);
			expect(result).toHaveLength(3);
			expect(result[0]).toMatchObject({ text: 'b' });
			const mid: TextNode | InlineNode | undefined = result[1];
			if (!mid) return;
			expect(isInlineNode(mid)).toBe(true);
			expect(result[2]).toMatchObject({ text: 'c' });
		});

		it('excludes InlineNode outside range', () => {
			const result: (TextNode | InlineNode)[] = sliceInlineContent(
				[text('ab'), emoji, text('cd')],
				0,
				2,
			);
			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({ text: 'ab' });
		});
	});

	describe('applyMarkToInlineContent', () => {
		it('adds a mark to the full range', () => {
			const result: (TextNode | InlineNode)[] = applyMarkToInlineContent(
				[text('hello')],
				0,
				5,
				bold,
				true,
			);
			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({ text: 'hello', marks: [bold] });
		});

		it('adds a mark to a partial range', () => {
			const result: (TextNode | InlineNode)[] = applyMarkToInlineContent(
				[text('hello')],
				1,
				4,
				bold,
				true,
			);
			expect(result).toHaveLength(3);
			expect(result[0]).toMatchObject({ text: 'h', marks: [] });
			expect(result[1]).toMatchObject({ text: 'ell', marks: [bold] });
			expect(result[2]).toMatchObject({ text: 'o', marks: [] });
		});

		it('removes a mark from content', () => {
			const result: (TextNode | InlineNode)[] = applyMarkToInlineContent(
				[text('hello', [bold])],
				0,
				5,
				bold,
				false,
			);
			expect(result).toHaveLength(1);
			expect(result[0]).toMatchObject({ text: 'hello', marks: [] });
		});

		it('skips InlineNodes', () => {
			const result: (TextNode | InlineNode)[] = applyMarkToInlineContent(
				[text('a'), emoji, text('b')],
				0,
				4,
				bold,
				true,
			);
			expect(result).toHaveLength(3);
			const mid: TextNode | InlineNode | undefined = result[1];
			if (!mid) return;
			expect(isInlineNode(mid)).toBe(true);
			expect(result[0]).toMatchObject({ marks: [bold] });
			expect(result[2]).toMatchObject({ marks: [bold] });
		});
	});

	describe('insertInlineNodeAtOffset', () => {
		it('inserts at the beginning', () => {
			const result: (TextNode | InlineNode)[] = insertInlineNodeAtOffset([text('hello')], 0, emoji);
			expect(result).toHaveLength(2);
			const first: TextNode | InlineNode | undefined = result[0];
			if (!first) return;
			expect(isInlineNode(first)).toBe(true);
			expect(result[1]).toMatchObject({ text: 'hello' });
		});

		it('inserts in the middle of text', () => {
			const result: (TextNode | InlineNode)[] = insertInlineNodeAtOffset([text('hello')], 2, emoji);
			expect(result).toHaveLength(3);
			expect(result[0]).toMatchObject({ text: 'he' });
			const mid: TextNode | InlineNode | undefined = result[1];
			if (!mid) return;
			expect(isInlineNode(mid)).toBe(true);
			expect(result[2]).toMatchObject({ text: 'llo' });
		});

		it('inserts at the end', () => {
			const result: (TextNode | InlineNode)[] = insertInlineNodeAtOffset([text('hello')], 5, emoji);
			expect(result).toHaveLength(2);
			expect(result[0]).toMatchObject({ text: 'hello' });
			const second: TextNode | InlineNode | undefined = result[1];
			if (!second) return;
			expect(isInlineNode(second)).toBe(true);
		});

		it('inserts into empty content', () => {
			const result: (TextNode | InlineNode)[] = insertInlineNodeAtOffset([], 0, emoji);
			expect(result).toHaveLength(1);
			const first: TextNode | InlineNode | undefined = result[0];
			if (!first) return;
			expect(isInlineNode(first)).toBe(true);
		});

		it('inserts before an existing InlineNode', () => {
			const other: InlineNode = createInlineNode(inlineType('mention'), { id: '1' });
			const result: (TextNode | InlineNode)[] = insertInlineNodeAtOffset([emoji], 0, other);
			expect(result).toHaveLength(2);
			expect((result[0] as InlineNode).inlineType).toBe('mention');
			expect((result[1] as InlineNode).inlineType).toBe('emoji');
		});
	});

	describe('removeInlineNodeAtOffset', () => {
		it('removes an InlineNode at the given offset', () => {
			const result: (TextNode | InlineNode)[] = removeInlineNodeAtOffset(
				[text('ab'), emoji, text('cd')],
				2,
			);
			expect(result).toHaveLength(2);
			expect(result.every((n) => isTextNode(n))).toBe(true);
		});

		it('preserves other InlineNodes', () => {
			const other: InlineNode = createInlineNode(inlineType('mention'), { id: '1' });
			const result: (TextNode | InlineNode)[] = removeInlineNodeAtOffset([emoji, other], 0);
			expect(result).toHaveLength(1);
			expect((result[0] as InlineNode).inlineType).toBe('mention');
		});
	});

	describe('setInlineNodeAttrsAtOffset', () => {
		it('updates attrs of the InlineNode at offset', () => {
			const result: (TextNode | InlineNode)[] = setInlineNodeAttrsAtOffset(
				[text('ab'), emoji, text('cd')],
				2,
				{ name: 'heart' },
			);
			expect(result).toHaveLength(3);
			expect((result[1] as InlineNode).attrs).toEqual({ name: 'heart' });
		});

		it('does not modify InlineNodes at other offsets', () => {
			const other: InlineNode = createInlineNode(inlineType('mention'), { id: '1' });
			const result: (TextNode | InlineNode)[] = setInlineNodeAttrsAtOffset([emoji, other], 0, {
				name: 'wave',
			});
			expect((result[0] as InlineNode).attrs).toEqual({ name: 'wave' });
			expect((result[1] as InlineNode).attrs).toEqual({ id: '1' });
		});
	});

	describe('replaceInlineChildren', () => {
		it('returns new inline children when no blocks exist', () => {
			const original: (TextNode | InlineNode)[] = [text('old')];
			const replacement: (TextNode | InlineNode)[] = [text('new')];
			const result: readonly (TextNode | InlineNode)[] = replaceInlineChildren(
				original,
				replacement,
			);
			expect(result).toBe(replacement);
		});

		it('preserves block children when mixed', () => {
			const blockChild: unknown = {
				type: 'paragraph',
				id: 'nested',
				children: [text('')],
			};
			const original: unknown[] = [text('old'), blockChild];
			const replacement: (TextNode | InlineNode)[] = [text('new')];
			const result: unknown = replaceInlineChildren(
				original as readonly (TextNode | InlineNode)[],
				replacement,
			);
			expect(result).toHaveLength(2);
			expect((result as readonly unknown[])[0]).toMatchObject({ text: 'new' });
			expect((result as readonly unknown[])[1]).toBe(blockChild);
		});
	});

	describe('findRangesMissingMark', () => {
		it('returns empty for an empty range', () => {
			expect(findRangesMissingMark([text('hello')], 2, 2, markType('bold'))).toEqual([]);
		});

		it('returns empty when the mark is fully present', () => {
			expect(findRangesMissingMark([text('hello', [bold])], 0, 5, markType('bold'))).toEqual([]);
		});

		it('returns the full range when the mark is absent', () => {
			expect(findRangesMissingMark([text('hello')], 0, 5, markType('bold'))).toEqual([
				{ from: 0, to: 5 },
			]);
		});

		it('skips a leading marked sub-range', () => {
			// "A"(bold) + "B" → only [1,2) is missing
			expect(findRangesMissingMark([text('A', [bold]), text('B')], 0, 2, markType('bold'))).toEqual(
				[{ from: 1, to: 2 }],
			);
		});

		it('coalesces adjacent unmarked text nodes', () => {
			// "A" + "B" → one combined range [0,2)
			expect(findRangesMissingMark([text('A'), text('B')], 0, 2, markType('bold'))).toEqual([
				{ from: 0, to: 2 },
			]);
		});

		it('returns multiple ranges when marked sub-ranges interrupt', () => {
			// "A"(bold) + "B" + "C"(bold) + "D" → [1,2) and [3,4)
			expect(
				findRangesMissingMark(
					[text('A', [bold]), text('B'), text('C', [bold]), text('D')],
					0,
					4,
					markType('bold'),
				),
			).toEqual([
				{ from: 1, to: 2 },
				{ from: 3, to: 4 },
			]);
		});

		it('clips ranges to [from, to)', () => {
			expect(findRangesMissingMark([text('ABCDE')], 1, 4, markType('bold'))).toEqual([
				{ from: 1, to: 4 },
			]);
		});

		it('treats InlineNodes as inert and coalesces across them', () => {
			// "A" + emoji + "B" with range [0,3) and bold absent everywhere → coalesced [0,3)
			expect(findRangesMissingMark([text('A'), emoji, text('B')], 0, 3, markType('bold'))).toEqual([
				{ from: 0, to: 3 },
			]);
		});

		it('does not start a range on a leading InlineNode', () => {
			// emoji + "A" with range [0,2) → range starts at position 1 (text)
			expect(findRangesMissingMark([emoji, text('A')], 0, 2, markType('bold'))).toEqual([
				{ from: 1, to: 2 },
			]);
		});
	});

	describe('findRangesWithMark', () => {
		const boldRed: Mark = { type: markType('bold'), attrs: { color: 'red' } };
		const boldBlue: Mark = { type: markType('bold'), attrs: { color: 'blue' } };

		it('returns empty for an empty range', () => {
			expect(findRangesWithMark([text('hello', [bold])], 2, 2, markType('bold'))).toEqual([]);
		});

		it('returns empty when the mark is fully absent', () => {
			expect(findRangesWithMark([text('hello')], 0, 5, markType('bold'))).toEqual([]);
		});

		it('returns the full range with the actual mark when uniformly present', () => {
			expect(findRangesWithMark([text('hello', [bold])], 0, 5, markType('bold'))).toEqual([
				{ from: 0, to: 5, mark: bold },
			]);
		});

		it('captures the actual mark including attrs', () => {
			expect(findRangesWithMark([text('hi', [boldRed])], 0, 2, markType('bold'))).toEqual([
				{ from: 0, to: 2, mark: boldRed },
			]);
		});

		it('splits when adjacent nodes carry the same-type mark with different attrs', () => {
			expect(
				findRangesWithMark([text('A', [boldRed]), text('B', [boldBlue])], 0, 2, markType('bold')),
			).toEqual([
				{ from: 0, to: 1, mark: boldRed },
				{ from: 1, to: 2, mark: boldBlue },
			]);
		});

		it('coalesces adjacent equal-mark sub-ranges', () => {
			expect(
				findRangesWithMark([text('A', [bold]), text('B', [bold])], 0, 2, markType('bold')),
			).toEqual([{ from: 0, to: 2, mark: bold }]);
		});

		it('skips unmarked sub-ranges', () => {
			// "A"(bold) + "B" + "C"(bold) → two ranges [0,1) and [2,3)
			expect(
				findRangesWithMark(
					[text('A', [bold]), text('B'), text('C', [bold])],
					0,
					3,
					markType('bold'),
				),
			).toEqual([
				{ from: 0, to: 1, mark: bold },
				{ from: 2, to: 3, mark: bold },
			]);
		});

		it('treats InlineNodes as inert and coalesces equal-mark sub-ranges across them', () => {
			expect(
				findRangesWithMark([text('A', [bold]), emoji, text('B', [bold])], 0, 3, markType('bold')),
			).toEqual([{ from: 0, to: 3, mark: bold }]);
		});

		it('ignores other mark types', () => {
			expect(findRangesWithMark([text('hi', [italic])], 0, 2, markType('bold'))).toEqual([]);
		});
	});
});
