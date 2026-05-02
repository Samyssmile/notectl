/**
 * Built-in Java language support bundle.
 * Includes syntax highlighting (Java 21) and lexer-based smart-paste detection.
 *
 * Detection re-uses the same `JAVA_LANGUAGE` token definition that powers
 * highlighting — see `LexerDetector` for the algorithm. Smoking-gun
 * signatures encode constructs that are syntactically impossible outside
 * Java: dotted-path imports terminated by `;`, file-leading `package`
 * declarations, the canonical `main(String[] args)` entry point, and
 * `System.out` / `System.err` calls.
 */

import { JAVA_LANGUAGE } from '../../code-block/highlighter/languages/java.js';
import { LexerDetector } from '../../smart-paste/detectors/LexerDetector.js';
import type { LanguageSupport } from '../LanguageTypes.js';

const JAVA_SIGNATURES: readonly RegExp[] = [
	/^[ \t]*package\s+[\w.]+\s*;/m,
	/^[ \t]*import\s+(?:static\s+)?[\w.]+(?:\.\*)?\s*;/m,
	/\bSystem\s*\.\s*(?:out|err)\s*\.\s*\w+\s*\(/,
	/\bpublic\s+static\s+void\s+main\s*\(\s*String\s*\[\s*\]/,
];

export const JAVA_SUPPORT: LanguageSupport = {
	id: 'java',
	displayName: 'Java',
	highlighting: JAVA_LANGUAGE,
	detection: new LexerDetector(JAVA_LANGUAGE, { signatures: JAVA_SIGNATURES }),
};
