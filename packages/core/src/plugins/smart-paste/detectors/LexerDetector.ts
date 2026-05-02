/**
 * Generic, lexer-driven content detector.
 *
 * Re-uses the `LanguageDefinition` from the syntax highlighter as the
 * authoritative grammar for detection — anything the highlighter learns
 * to tokenize, the detector learns to recognize, with no parallel
 * heuristic to maintain.
 *
 * Detection strategy:
 * 1. **Lexer probe** — tokenize the candidate text with the language's
 *    patterns. Coverage and weighted density jointly form a calibrated
 *    confidence in `[0, 1]` (see `DetectionScorer`).
 * 2. **Smoking-gun signatures** — when present, language-specific regexes
 *    that confirm a plausible interpretation. A signature match adds a
 *    fixed bonus to the lexer-derived confidence (capped at 1.0); without
 *    signatures the lexer score stands on its own.
 *
 * Signatures must be definitionally specific to the target language —
 * patterns that are syntactically impossible in any competing language
 * the detector will be matched against. They are intentionally additive,
 * not gating: a signature on a near-zero lexer score still produces a
 * low overall confidence and is rejected by the minimum threshold.
 */

import type { LanguageDefinition } from '../../code-block/highlighter/TokenizerTypes.js';
import type { ContentDetector, DetectionResult } from '../SmartPasteTypes.js';
import { scoreFromStats } from './DetectionScorer.js';
import { type RelevanceWeights, type TokenStats, computeTokenStats } from './TokenStats.js';

/** Configuration options for the lexer-based content detector. */
export interface LexerDetectorOptions {
	/** Minimum number of non-empty lines required before detection runs. */
	readonly minLines?: number;

	/** Maximum input length analyzed (DoS guard). */
	readonly maxLength?: number;

	/** Minimum confidence value required to accept the detection. */
	readonly minConfidence?: number;

	/**
	 * Language-specific "smoking-gun" patterns. If any pattern matches,
	 * `signatureBonus` is added to the lexer-derived confidence (capped
	 * at 1.0). Patterns must be effectively impossible in any competing
	 * language the detector will be matched against.
	 */
	readonly signatures?: readonly RegExp[];

	/** Confidence bonus added on signature match. Defaults to `0.3`. */
	readonly signatureBonus?: number;

	/** Custom per-token-type relevance weights. Defaults to the canonical set. */
	readonly weights?: RelevanceWeights;
}

const DEFAULT_MIN_LINES = 2;
const DEFAULT_MAX_LENGTH = 100_000;
const DEFAULT_MIN_CONFIDENCE = 0.35;
const DEFAULT_SIGNATURE_BONUS = 0.3;

/**
 * Content detector that classifies pasted text using the same
 * `LanguageDefinition` employed for syntax highlighting.
 */
export class LexerDetector implements ContentDetector {
	readonly id: string;

	constructor(
		private readonly language: LanguageDefinition,
		private readonly options: LexerDetectorOptions = {},
	) {
		this.id = language.name;
	}

	detect(text: string): DetectionResult | null {
		const maxLength: number = this.options.maxLength ?? DEFAULT_MAX_LENGTH;
		if (text.length > maxLength) return null;

		const trimmed: string = text.trim();
		const minLines: number = this.options.minLines ?? DEFAULT_MIN_LINES;
		const lines: string[] = trimmed.split('\n').filter((l: string) => l.trim().length > 0);
		if (lines.length < minLines) return null;

		const stats: TokenStats = computeTokenStats(trimmed, this.language, this.options.weights);
		const lexerConfidence: number = scoreFromStats(stats);

		const bonus: number = this.matchesAnySignature(trimmed)
			? (this.options.signatureBonus ?? DEFAULT_SIGNATURE_BONUS)
			: 0;
		const confidence: number = Math.min(1, lexerConfidence + bonus);

		const minConfidence: number = this.options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
		if (confidence < minConfidence) return null;

		return { language: this.language.name, formattedText: trimmed, confidence };
	}

	private matchesAnySignature(text: string): boolean {
		const signatures: readonly RegExp[] = this.options.signatures ?? [];
		for (const signature of signatures) {
			if (signature.test(text)) return true;
		}
		return false;
	}
}
