/**
 * Pure helpers for indent and bracket analysis inside code blocks.
 *
 * All helpers operate on the raw block text plus an offset; no editor state,
 * no transactions. This keeps them trivially testable and reusable from
 * keyboard handlers and the text-input interceptor alike.
 */

export interface ResolvedIndent {
	/** Active indent unit ('\t' or N spaces). */
	readonly unit: string;
	/** Whether spaces are used (mirrors config). */
	readonly useSpaces: boolean;
	/** Effective indent width in characters. */
	readonly width: number;
}

const OPEN_BRACKETS = new Set(['{', '[', '(']);
const CLOSE_BRACKETS_TO_OPEN: Readonly<Record<string, string>> = {
	'}': '{',
	']': '[',
	')': '(',
};

/** Returns the inclusive line range `[start, end)` covering `offset`. */
export function getLineRange(text: string, offset: number): { start: number; end: number } {
	const start: number = text.lastIndexOf('\n', offset - 1) + 1;
	const nlIndex: number = text.indexOf('\n', offset);
	const end: number = nlIndex === -1 ? text.length : nlIndex;
	return { start, end };
}

/** Returns the leading whitespace (tabs/spaces only) of the line covering `offset`. */
export function getCurrentLineIndent(text: string, offset: number): string {
	const { start, end } = getLineRange(text, offset);
	let i: number = start;
	while (i < end) {
		const ch = text[i];
		if (ch !== ' ' && ch !== '\t') break;
		i++;
	}
	return text.slice(start, i);
}

/**
 * Returns the last non-whitespace character of `text` in the range
 * `[lineStart, cursorOffset)`, or `''` if the entire prefix is whitespace.
 * The cursor itself is excluded.
 */
export function lastNonWhitespaceCharBeforeCursor(text: string, cursorOffset: number): string {
	const { start } = getLineRange(text, cursorOffset);
	for (let i = cursorOffset - 1; i >= start; i--) {
		const ch = text[i];
		if (ch && ch !== ' ' && ch !== '\t') return ch;
	}
	return '';
}

/** True if the prefix `[lineStart, cursorOffset)` contains only whitespace. */
export function isWhitespaceOnlyBeforeOffset(text: string, cursorOffset: number): boolean {
	const { start } = getLineRange(text, cursorOffset);
	for (let i = start; i < cursorOffset; i++) {
		const ch = text[i];
		if (ch !== ' ' && ch !== '\t') return false;
	}
	return true;
}

/**
 * True if the prefix up to `cursorOffset` ends with an open bracket
 * (`{`, `[`, `(`) — ignoring trailing whitespace.
 */
export function endsWithOpenBracket(text: string, cursorOffset: number): boolean {
	const last: string = lastNonWhitespaceCharBeforeCursor(text, cursorOffset);
	return OPEN_BRACKETS.has(last);
}

/**
 * True if the user just typed Enter between a matching open/close pair
 * (e.g. `{|}`, `[|]`, `(|)`). Checks the next char at cursor against the
 * char before the cursor; only matches direct pairs without intervening
 * whitespace.
 */
export function isBetweenBracketPair(text: string, cursorOffset: number): boolean {
	if (cursorOffset <= 0 || cursorOffset >= text.length) return false;
	const before = text[cursorOffset - 1];
	const after = text[cursorOffset];
	if (!before || !after) return false;
	const expectedOpen: string | undefined = CLOSE_BRACKETS_TO_OPEN[after];
	return expectedOpen === before;
}

/**
 * Returns the unit string for the resolved indent config.
 * `'\t'` for tabs, `' '.repeat(spaceCount)` for spaces.
 */
export function resolveIndentUnit(useSpaces: boolean, spaceCount: number): string {
	return useSpaces ? ' '.repeat(spaceCount) : '\t';
}

/**
 * Removes exactly one indent unit from the start of `line`. If `line`
 * does not start with a full unit, removes whatever leading whitespace
 * exists up to the unit length (so a partially-indented line still loses
 * its leading whitespace). Returns `{ removed, rest }`.
 */
export function dedentOnce(
	line: string,
	useSpaces: boolean,
	spaceCount: number,
): { removed: string; rest: string } {
	if (line.length === 0) return { removed: '', rest: line };
	if (!useSpaces) {
		if (line[0] === '\t') return { removed: '\t', rest: line.slice(1) };
		// fall through: try removing up to `spaceCount` leading spaces
	}
	let i = 0;
	while (i < spaceCount && line[i] === ' ') i++;
	return { removed: line.slice(0, i), rest: line.slice(i) };
}

/**
 * Returns the indentation that should be inserted *after* the newline when
 * the user presses Enter on the line covering `cursorOffset`. Combines the
 * line's existing leading whitespace with an extra indent step if the
 * prefix ends with an open bracket and `mode === 'brackets'`.
 */
export function nextIndentLevel(
	text: string,
	cursorOffset: number,
	mode: 'none' | 'keep' | 'brackets',
	unit: string,
): string {
	if (mode === 'none') return '';
	const base: string = getCurrentLineIndent(text, cursorOffset);
	if (mode === 'keep') return base;
	if (endsWithOpenBracket(text, cursorOffset)) return base + unit;
	return base;
}

/**
 * True if the prefix triggers the 3-line block-pattern: `{|}` (or `[|]`,
 * `(|)`) where cursor is exactly between an open/close pair. Used by the
 * Enter handler to expand the cursor onto its own indented line.
 */
export function shouldOpenIndentBlock(text: string, cursorOffset: number): boolean {
	return isBetweenBracketPair(text, cursorOffset);
}
