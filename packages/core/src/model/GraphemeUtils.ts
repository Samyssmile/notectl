/**
 * Grapheme-cluster utilities for correct character navigation.
 *
 * Uses `Intl.Segmenter` (with `granularity: 'grapheme'`) to correctly
 * handle multi-code-unit characters such as emoji, ZWJ sequences, and
 * combining characters. Falls back to +1/-1 when `Intl.Segmenter` is
 * not available.
 */

const SEGMENTER_SUPPORTED: boolean = typeof Intl !== 'undefined' && 'Segmenter' in Intl;

/**
 * Returns the number of UTF-16 code units in the next grapheme cluster
 * starting at `offset`. Returns 0 if `offset` is at or past the end.
 */
export function nextGraphemeSize(text: string, offset: number): number {
	if (offset >= text.length || text.length === 0) return 0;

	if (SEGMENTER_SUPPORTED) {
		const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
		for (const segment of segmenter.segment(text)) {
			if (segment.index >= offset) {
				return segment.segment.length;
			}
		}
		return 0;
	}

	return 1;
}

/**
 * Returns the number of UTF-16 code units in the grapheme cluster
 * immediately before `offset`. Returns 0 if `offset` is 0 or the
 * string is empty.
 */
export function prevGraphemeSize(text: string, offset: number): number {
	if (offset <= 0 || text.length === 0) return 0;

	if (SEGMENTER_SUPPORTED) {
		const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
		let lastSize = 1;
		for (const segment of segmenter.segment(text)) {
			if (segment.index + segment.segment.length >= offset) {
				lastSize = segment.segment.length;
				break;
			}
			lastSize = segment.segment.length;
		}
		return lastSize;
	}

	return 1;
}
