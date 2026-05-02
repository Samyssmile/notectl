/**
 * Tokenization statistics used by the lexer-based content detector to
 * derive a calibrated, discriminative confidence score per language.
 *
 * The same `LanguageDefinition` that powers syntax highlighting is run
 * over the candidate text, and the token stream is reduced to four
 * aggregate measures: how much of the input was recognized, how many
 * tokens were emitted, and the relevance-weighted byte score that
 * favours language-specific tokens (keywords, decorators, tags) over
 * universal ones (punctuation, operators).
 */

import { iterateTokens } from '../../code-block/highlighter/TokenIteration.js';
import type { LanguageDefinition } from '../../code-block/highlighter/TokenizerTypes.js';

/**
 * Per-token-type relevance weights.
 *
 * Higher weights indicate a matched token of that type contributes more
 * evidence that the input is in the corresponding language. Tokens that
 * appear in many languages (punctuation, operators) are weighted low;
 * tokens whose patterns encode language-specific identifiers (keywords,
 * annotations, tags) are weighted high.
 */
export type RelevanceWeights = Readonly<Record<string, number>>;

/**
 * Default relevance weights spanning the canonical syntax token types.
 * Values were chosen so that keyword-rich code (typical for general
 * programming languages) and tag/attribute-rich code (markup) reach
 * scores comparable to one another while pure punctuation falls off.
 */
export const DEFAULT_RELEVANCE_WEIGHTS: RelevanceWeights = {
	keyword: 1.0,
	function: 0.9,
	type: 1.0,
	annotation: 1.5,
	property: 1.2,
	tag: 1.5,
	attribute: 1.5,
	constant: 0.8,
	string: 0.4,
	number: 0.4,
	boolean: 0.6,
	null: 0.6,
	regex: 0.8,
	comment: 0.3,
	operator: 0.1,
	punctuation: 0.1,
};

/**
 * Maximum value present in `DEFAULT_RELEVANCE_WEIGHTS`.
 * Used as the normalization upper bound when computing density —
 * a stream consisting entirely of maximally-weighted tokens has
 * density 1.0.
 */
export const MAX_RELEVANCE_WEIGHT = 1.5;

/** Aggregate statistics describing one tokenization pass. */
export interface TokenStats {
	readonly totalBytes: number;
	readonly nonWhitespaceBytes: number;
	readonly recognizedBytes: number;
	readonly unknownBytes: number;
	readonly tokenCount: number;
	readonly weightedScore: number;
}

/**
 * Tokenizes `code` with `language` and returns aggregate statistics
 * suitable for confidence scoring across competing language candidates.
 *
 * Whitespace is counted separately from `unknownBytes` so the scorer can
 * normalize against the meaningful (non-whitespace) input length without
 * unfairly penalizing indentation or vertical spacing.
 */
export function computeTokenStats(
	code: string,
	language: LanguageDefinition,
	weights: RelevanceWeights = DEFAULT_RELEVANCE_WEIGHTS,
): TokenStats {
	const totalBytes: number = code.length;
	if (totalBytes === 0) {
		return {
			totalBytes: 0,
			nonWhitespaceBytes: 0,
			recognizedBytes: 0,
			unknownBytes: 0,
			tokenCount: 0,
			weightedScore: 0,
		};
	}

	const fallbackWeight: number = weights.punctuation ?? 0;

	let recognizedBytes = 0;
	let weightedScore = 0;
	let tokenCount = 0;

	for (const token of iterateTokens(code, language)) {
		const len: number = token.to - token.from;
		recognizedBytes += len;
		tokenCount++;
		const weight: number = weights[token.type] ?? fallbackWeight;
		weightedScore += len * weight;
	}

	const nonWhitespaceBytes: number = countNonWhitespaceBytes(code);

	return {
		totalBytes,
		nonWhitespaceBytes,
		recognizedBytes,
		unknownBytes: totalBytes - recognizedBytes,
		tokenCount,
		weightedScore,
	};
}

function countNonWhitespaceBytes(text: string): number {
	let count = 0;
	for (let i = 0; i < text.length; i++) {
		const c: number = text.charCodeAt(i);
		if (c !== 32 && c !== 9 && c !== 10 && c !== 13) count++;
	}
	return count;
}
