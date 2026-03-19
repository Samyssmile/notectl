/**
 * Java content detector - identifies Java source code for code block insertion.
 *
 * Uses a scoring system based on structural patterns:
 * - Class/interface/enum/record declarations
 * - Package and import statements
 * - Method signatures with access modifiers
 * - Java-specific keywords and syntax patterns
 *
 * Requires multiple signals to avoid false positives on plain text.
 */

import type { ContentDetector, DetectionResult } from '../SmartPasteTypes.js';

/** Minimum number of non-empty lines to consider as code. */
const MIN_LINES = 2;

/** Minimum score to consider the text as Java code. */
const MIN_SCORE = 3;

/** Confidence score for detected Java code. */
const JAVA_CONFIDENCE = 0.8;

/** Matches class, interface, enum, record declarations. */
const CLASS_DECLARATION =
	/(?:public|private|protected|abstract|final|sealed|non-sealed)?\s*(?:class|interface|enum|record)\s+\w+/;

/** Matches package statements. */
const PACKAGE_STATEMENT = /^package\s+[\w.]+\s*;/m;

/** Matches import statements. */
const IMPORT_STATEMENT = /^import\s+(?:static\s+)?[\w.*]+\s*;/m;

/** Matches method signatures with return type. */
const METHOD_SIGNATURE =
	/(?:public|private|protected|static|final|abstract|synchronized|native)\s+(?:[\w<>\[\]?,\s]+)\s+\w+\s*\(/;

/** Matches annotation usage. */
const ANNOTATION = /^[ \t]*@\w+/m;

/** Matches lines ending with semicolons (excluding CSS-like patterns). */
const SEMICOLON_LINES = /;\s*$/gm;

/** Matches Java-style braces on their own line or after code. */
const BRACE_PATTERN = /[{}\s]*[{}]\s*$/gm;

/** Matches Java main method. */
const MAIN_METHOD = /public\s+static\s+void\s+main\s*\(\s*String\s*\[\s*\]\s+\w+\s*\)/;

/** Matches common Java types. */
const JAVA_TYPES =
	/\b(?:String|Integer|Boolean|List|Map|Set|Optional|void|int|long|double|boolean|char|byte|float|short)\b/;

/** Matches System.out or System.err calls. */
const SYSTEM_CALL = /System\s*\.\s*(?:out|err)\s*\.\s*\w+\s*\(/;

/** Matches try-catch blocks. */
const TRY_CATCH = /\btry\s*\{[\s\S]*?\}\s*catch\s*\(/;

/** Matches new keyword with type. */
const NEW_INSTANCE = /\bnew\s+[A-Z]\w*\s*[<(]/;

export class JavaDetector implements ContentDetector {
	readonly id = 'java';

	detect(text: string): DetectionResult | null {
		const trimmed: string = text.trim();
		const lines: string[] = trimmed.split('\n').filter((l: string) => l.trim().length > 0);
		if (lines.length < MIN_LINES) return null;

		const score: number = this.computeScore(trimmed);
		if (score < MIN_SCORE) return null;

		return {
			language: 'java',
			formattedText: trimmed,
			confidence: JAVA_CONFIDENCE,
		};
	}

	private computeScore(text: string): number {
		let score = 0;

		// Strong signals (2 points each)
		if (CLASS_DECLARATION.test(text)) score += 2;
		if (PACKAGE_STATEMENT.test(text)) score += 2;
		if (IMPORT_STATEMENT.test(text)) score += 2;
		if (MAIN_METHOD.test(text)) score += 2;
		if (SYSTEM_CALL.test(text)) score += 2;
		if (TRY_CATCH.test(text)) score += 2;

		// Medium signals (1 point each)
		if (METHOD_SIGNATURE.test(text)) score += 1;
		if (ANNOTATION.test(text)) score += 1;
		if (JAVA_TYPES.test(text)) score += 1;
		if (NEW_INSTANCE.test(text)) score += 1;

		// Structural signals
		const semicolonCount: number = (text.match(SEMICOLON_LINES) ?? []).length;
		if (semicolonCount >= 2) score += 1;

		const braceCount: number = (text.match(BRACE_PATTERN) ?? []).length;
		if (braceCount >= 2) score += 1;

		return score;
	}
}
