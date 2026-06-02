/**
 * Grapheme-cluster utilities for correct character navigation.
 *
 * Uses `Intl.Segmenter` (with `granularity: 'grapheme'`) to correctly
 * handle multi-code-unit characters such as emoji, ZWJ sequences, and
 * combining characters. Falls back to +1/-1 when `Intl.Segmenter` is
 * not available.
 */

const SEGMENTER_SUPPORTED: boolean = typeof Intl !== 'undefined' && 'Segmenter' in Intl;
const SEGMENTER: Intl.Segmenter | null = SEGMENTER_SUPPORTED
	? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
	: null;

/**
 * Returns the number of UTF-16 code units to advance from `offset` to the next
 * grapheme-cluster boundary. Returns 0 if `offset` is at or past the end.
 *
 * Callers normally pass an offset that already sits on a cluster boundary, in
 * which case this is the full width of the cluster starting at `offset`. When
 * `offset` lands inside a cluster, the remaining units up to that cluster's end
 * are returned so navigation snaps forward to the next boundary (rather than
 * skipping the rest of the current cluster).
 */
export function nextGraphemeSize(text: string, offset: number): number {
	if (offset >= text.length || text.length === 0) return 0;

	if (SEGMENTER) {
		for (const segment of SEGMENTER.segment(text)) {
			const end: number = segment.index + segment.segment.length;
			if (end > offset) {
				return end - offset;
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

	if (SEGMENTER) {
		let lastSize = 1;
		for (const segment of SEGMENTER.segment(text)) {
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
