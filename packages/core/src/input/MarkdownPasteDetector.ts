/**
 * Cheap, synchronous Markdown detector for the paste pipeline.
 *
 * Stays in the base bundle (no engine dependency) so the heavy parser can be
 * dynamically imported only on a positive match (D11). Detection is deliberately
 * conservative: it fires only on strong **block-level** signals (a fenced code
 * block, a GFM table, or a run of list/heading/blockquote markers), never on a
 * stray inline `*` or `_`, so ordinary prose pastes through unchanged (D11,
 * "auto" mode must never turn normal paste into italic soup).
 */

/** A fenced code block opener. */
const FENCE = /(^|\n) {0,3}(```|~~~)/;

/** A GFM table delimiter row (`| --- | :--: |`). */
const TABLE_DELIMITER = /(^|\n)\s*\|?[ :|]*-{3,}[ :|-]*(\n|$)/;

/** Block-level line markers: ATX heading, list bullet/ordered, blockquote. */
const BLOCK_MARKER = /(^|\n) {0,3}(#{1,6} |[-*+] |\d{1,9}[.)] |> )/g;

/**
 * Returns true when the plain-text clipboard payload carries strong block-level
 * Markdown signals worth handing to the full parser.
 */
export function looksLikeMarkdown(text: string): boolean {
	if (text.length === 0) return false;
	if (FENCE.test(text)) return true;
	if (text.includes('|') && TABLE_DELIMITER.test(text)) return true;
	const markers: RegExpMatchArray | null = text.match(BLOCK_MARKER);
	return markers !== null && markers.length >= 2;
}
