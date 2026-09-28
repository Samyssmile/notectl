/**
 * Minimal single-range difference between two strings.
 */

/** Replacing `before[from, to)` with `text` turns `before` into `after`. */
export interface TextChange {
	readonly from: number;
	readonly to: number;
	readonly text: string;
}

/** Decides whether `before[beforeIndex]` and `after[afterIndex]` hold the same unit. */
export type PositionEquality = (beforeIndex: number, afterIndex: number) => boolean;

export interface TextChangeOptions {
	/** Offset in `before` where an ambiguous edit is expected to start. */
	readonly preferredFrom: number;
	/**
	 * Offset in `before` where an ambiguous pure deletion is expected to end, as
	 * for a backspace at a collapsed caret. Takes precedence over `preferredFrom`
	 * for deletions.
	 */
	readonly preferredDeletionEnd?: number;
	/** Position equality; compares characters strictly by default. */
	readonly equals?: PositionEquality;
}

/**
 * Finds the single range whose replacement turns `before` into `after`, or
 * `null` when both are equal under `options.equals`.
 *
 * The range is bounded by the longest common prefix and suffix. When they
 * overlap, which happens when the edit sits in a run of repeated units
 * (`hel|lo` + `l`), several ranges are valid; the one at the known edit
 * position wins so formatting follows the position where the text actually
 * changed. An equality that knows the identity of repeated units, such as
 * inline nodes, removes the ambiguity for them.
 *
 * @param before - The original text.
 * @param after - The edited text.
 * @param options - Preferred edit position and position equality.
 */
export function findTextChange(
	before: string,
	after: string,
	options: TextChangeOptions,
): TextChange | null {
	const equals: PositionEquality =
		options.equals ?? ((i: number, j: number): boolean => before.charAt(i) === after.charAt(j));
	const shorter: number = Math.min(before.length, after.length);
	let start = 0;
	while (start < shorter && equals(start, start)) {
		start++;
	}
	if (start === before.length && start === after.length) return null;

	let endBefore: number = before.length;
	let endAfter: number = after.length;
	while (endBefore > 0 && endAfter > 0 && equals(endBefore - 1, endAfter - 1)) {
		endBefore--;
		endAfter--;
	}

	if (endBefore < start && before.length < after.length) {
		// Pure insertion inside a repeated run: `after` gained endAfter - endBefore units.
		start -= shiftTowards(options.preferredFrom, endBefore, start);
		endAfter = start + (endAfter - endBefore);
		endBefore = start;
	} else if (endAfter < start) {
		// Pure deletion inside a repeated run: `before` lost endBefore - endAfter units.
		const length: number = endBefore - endAfter;
		start = deletionStart(options, endAfter, start, length);
		endBefore = start + length;
		endAfter = start;
	}

	return { from: start, to: endBefore, text: after.slice(start, endAfter) };
}

/** Start of an ambiguous deletion of `length` units that may begin anywhere in `[lowest, highest]`. */
function deletionStart(
	options: TextChangeOptions,
	lowest: number,
	highest: number,
	length: number,
): number {
	const end: number | undefined = options.preferredDeletionEnd;
	if (end !== undefined && end - length >= lowest && end - length <= highest) return end - length;
	return highest - shiftTowards(options.preferredFrom, lowest, highest);
}

/** How far `start` may move back towards `preferred` without leaving `[lowest, start]`. */
function shiftTowards(preferred: number, lowest: number, start: number): number {
	return preferred >= lowest && preferred <= start ? start - preferred : 0;
}
