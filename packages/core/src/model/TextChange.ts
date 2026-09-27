/**
 * Minimal single-range difference between two strings.
 */

/** Replacing `before[from, to)` with `text` turns `before` into `after`. */
export interface TextChange {
	readonly from: number;
	readonly to: number;
	readonly text: string;
}

/** Decides whether two single characters count as equal. */
export type CharEquality = (a: string, b: string) => boolean;

const strictlyEqual: CharEquality = (a, b) => a === b;

/**
 * Finds the single range whose replacement turns `before` into `after`, or
 * `null` when both are equal under `charsEqual`.
 *
 * The range is bounded by the longest common prefix and suffix. When they
 * overlap, which happens when the edit sits in a run of repeated characters
 * (`hel|lo` + `l`), several ranges are valid; the one closest to
 * `preferredFrom`, the known edit position, wins so formatting follows the
 * position where the text actually changed.
 *
 * @param before - The original text.
 * @param after - The edited text.
 * @param preferredFrom - Offset in `before` where the edit is expected to start.
 * @param charsEqual - Character equality; strict by default.
 */
export function findTextChange(
	before: string,
	after: string,
	preferredFrom: number,
	charsEqual: CharEquality = strictlyEqual,
): TextChange | null {
	const shorter: number = Math.min(before.length, after.length);
	let start = 0;
	while (start < shorter && charsEqual(before.charAt(start), after.charAt(start))) {
		start++;
	}
	if (start === before.length && start === after.length) return null;

	let endBefore: number = before.length;
	let endAfter: number = after.length;
	while (
		endBefore > 0 &&
		endAfter > 0 &&
		charsEqual(before.charAt(endBefore - 1), after.charAt(endAfter - 1))
	) {
		endBefore--;
		endAfter--;
	}

	if (endBefore < start && before.length < after.length) {
		// Pure insertion inside a repeated run: `after` gained endAfter - endBefore chars.
		start -= shiftTowards(preferredFrom, endBefore, start);
		endAfter = start + (endAfter - endBefore);
		endBefore = start;
	} else if (endAfter < start) {
		// Pure deletion inside a repeated run: `before` lost endBefore - endAfter chars.
		start -= shiftTowards(preferredFrom, endAfter, start);
		endBefore = start + (endBefore - endAfter);
		endAfter = start;
	}

	return { from: start, to: endBefore, text: after.slice(start, endAfter) };
}

/** How far `start` may move back towards `preferred` without leaving `[lowest, start]`. */
function shiftTowards(preferred: number, lowest: number, start: number): number {
	return preferred >= lowest && preferred <= start ? start - preferred : 0;
}
