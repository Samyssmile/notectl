/**
 * Pure scoring function that maps tokenization statistics to a
 * discriminative confidence value in `[0, 1]`.
 *
 * The score combines two independent signals:
 * - **Coverage** — fraction of input bytes recognized by the language's
 *   patterns. Low coverage means many bytes fell through with no rule
 *   matching, which is strong evidence the text is not in this language.
 * - **Density** — average per-byte weight of recognized tokens, normalized
 *   against the maximum possible weight. High density means the recognized
 *   tokens are themselves discriminative (keywords, annotations) rather
 *   than universally-shared syntax (punctuation, operators).
 *
 * Coverage and density are equally weighted: a language that recognizes
 * lots of low-information punctuation is no more credible than one that
 * recognizes a few highly-specific keywords surrounded by unknown bytes,
 * and only the union of both signals sums to high confidence.
 */

import { MAX_RELEVANCE_WEIGHT, type TokenStats } from './TokenStats.js';

/**
 * Weight of the byte-coverage signal in the combined confidence.
 *
 * Coverage dominates because failure to recognize most non-whitespace
 * bytes is the strongest evidence that the input is not in this language.
 * Relevance is a secondary refinement: among languages with comparable
 * coverage, the one whose recognized tokens are more discriminative
 * (keywords / annotations / tags rather than punctuation) wins.
 */
const COVERAGE_WEIGHT = 0.7;
/** Weight of the relevance-density signal in the combined confidence. */
const RELEVANCE_WEIGHT = 0.3;

/**
 * Maps tokenization statistics to a confidence value in `[0, 1]`.
 *
 * Both axes normalize against `nonWhitespaceBytes` so the score scales
 * linearly with the size of the meaningful input and is unaffected by
 * indentation:
 *
 * - **Coverage** = recognized bytes / non-whitespace bytes. Measures how
 *   *much* of the meaningful input the lexer matched.
 * - **Relevance** = weighted score / non-whitespace bytes / max weight.
 *   Measures how *rich* the matched tokens are on average — a sparse run
 *   of keywords amid mostly-unknown text scores low here even though the
 *   recognized bytes alone would look high-weight.
 */
export function scoreFromStats(stats: TokenStats): number {
	if (stats.nonWhitespaceBytes === 0) return 0;

	const coverage: number = stats.recognizedBytes / stats.nonWhitespaceBytes;
	const relevance: number = stats.weightedScore / stats.nonWhitespaceBytes / MAX_RELEVANCE_WEIGHT;

	return clamp01(COVERAGE_WEIGHT * coverage + RELEVANCE_WEIGHT * relevance);
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}
