/**
 * TypeScript content detector — identifies TypeScript / JavaScript source code
 * for code block insertion.
 *
 * Uses a scoring system based on structural patterns:
 * - ES module imports / exports
 * - TypeScript-specific declarations (`type`, `interface`, `enum`, `namespace`)
 * - `const` / `let` bindings
 * - Arrow functions, optional chaining, nullish coalescing
 * - Template literals and decorators
 *
 * Requires multiple signals to avoid false positives on plain text or other
 * curly-brace languages (Java, JSON, CSS).
 */

import type { ContentDetector, DetectionResult } from '../SmartPasteTypes.js';

/** Maximum text length to analyze for TypeScript detection. */
const MAX_DETECT_LENGTH = 100_000;

/** Minimum number of non-empty lines to consider as code. */
const MIN_LINES = 2;

/** Minimum score to consider the text as TypeScript code. */
const MIN_SCORE = 3;

/** Confidence score for detected TypeScript code. */
const TYPESCRIPT_CONFIDENCE = 0.8;

/** ES module import: `import ... from '...'` or bare `import '...'`. */
const ES_IMPORT = /^[ \t]*import\b[^;]*?\bfrom\s+['"][^'"]+['"]\s*;?/m;

/** Bare side-effect import: `import './foo';`. */
const ES_BARE_IMPORT = /^[ \t]*import\s+['"][^'"]+['"]\s*;?/m;

/** ES export keyword usage. */
const ES_EXPORT =
	/^[ \t]*export\s+(?:default\s+|type\s+|const\s+|let\s+|var\s+|function\s+|async\s+function\b|class\s+|interface\s+|enum\s+|namespace\s+|abstract\s+class\b|\*\s+from\b|\{)/m;

/** TypeScript type alias declaration. */
const TYPE_ALIAS = /^[ \t]*(?:export\s+)?type\s+\w+\s*(?:<[^=>]*>)?\s*=/m;

/** TypeScript interface declaration. */
const INTERFACE_DECL = /^[ \t]*(?:export\s+)?interface\s+\w+/m;

/** TypeScript enum declaration. */
const ENUM_DECL = /^[ \t]*(?:export\s+)?(?:const\s+)?enum\s+\w+/m;

/** TypeScript namespace/module declaration. */
const NAMESPACE_DECL = /^[ \t]*(?:export\s+)?(?:declare\s+)?(?:namespace|module)\s+\w+/m;

/** TypeScript ambient declaration. */
const DECLARE_STMT = /^[ \t]*declare\s+(?:const|let|var|function|class|namespace|module|global)\b/m;

/** `const` / `let` binding (ES2015+). */
const CONST_LET = /\b(?:const|let)\s+[\w$]+\s*[:=]/;

/** Arrow function (excluding `=>=` matches). */
const ARROW_FUNCTION = /=>\s*[^=]/;

/** Optional chaining operator. */
const OPTIONAL_CHAIN = /\?\.\s*[\w$(]/;

/** Nullish coalescing operator. */
const NULLISH_COALESCE = /\?\?[^=]/;

/** Template literal usage. */
const TEMPLATE_LITERAL = /`[^`\n]*\$\{[^}]*\}[^`\n]*`|`[^`]*`/;

/** Type annotation on parameter or variable: `name: Type`. */
const TYPE_ANNOTATION = /(?:[\w$\])])\s*:\s*[A-Z][\w$]*(?:<[^>]*>)?/;

/** Async function or method. */
const ASYNC_FUNCTION = /\basync\s+(?:function\b|\([^)]*\)\s*(?:=>|:)|[\w$]+\s*\()/;

/** Decorator usage. */
const DECORATOR =
	/^[ \t]*@[\w$]+\s*(?:\([^)]*\))?\s*\n[ \t]*(?:export\s+|public\s+|private\s+|protected\s+|class\b|async\b|[\w$]+\s*[(:])/m;

/** Generic type parameters in function or class. */
const GENERICS = /\b(?:function|class|interface|type)\s+[\w$]+\s*<[\w$,\s]+>/;

/** Lines ending with semicolons. */
const SEMICOLON_LINES = /;\s*$/gm;

/** Java-style package statement (negative signal — distinguishes from Java). */
const JAVA_PACKAGE = /^[ \t]*package\s+[\w.]+\s*;/m;

/** Java-style System.out call (negative signal). */
const JAVA_SYSTEM_CALL = /System\s*\.\s*(?:out|err)\s*\.\s*\w+\s*\(/;

export class TypeScriptDetector implements ContentDetector {
	readonly id = 'typescript';

	detect(text: string): DetectionResult | null {
		if (text.length > MAX_DETECT_LENGTH) return null;
		const trimmed: string = text.trim();
		const lines: string[] = trimmed.split('\n').filter((l: string) => l.trim().length > 0);
		if (lines.length < MIN_LINES) return null;

		// Negative signals — code that strongly looks like Java should not be flagged as TS.
		if (JAVA_PACKAGE.test(trimmed) || JAVA_SYSTEM_CALL.test(trimmed)) return null;

		const score: number = this.computeScore(trimmed);
		if (score < MIN_SCORE) return null;

		return {
			language: 'typescript',
			formattedText: trimmed,
			confidence: TYPESCRIPT_CONFIDENCE,
		};
	}

	private computeScore(text: string): number {
		let score = 0;

		// Strong signals (2 points each)
		if (ES_IMPORT.test(text)) score += 2;
		if (ES_BARE_IMPORT.test(text)) score += 2;
		if (ES_EXPORT.test(text)) score += 2;
		if (TYPE_ALIAS.test(text)) score += 2;
		if (INTERFACE_DECL.test(text)) score += 2;
		if (ENUM_DECL.test(text)) score += 2;
		if (NAMESPACE_DECL.test(text)) score += 2;
		if (DECLARE_STMT.test(text)) score += 2;

		// Medium signals (1 point each)
		if (CONST_LET.test(text)) score += 1;
		if (ARROW_FUNCTION.test(text)) score += 1;
		if (OPTIONAL_CHAIN.test(text)) score += 1;
		if (NULLISH_COALESCE.test(text)) score += 1;
		if (TEMPLATE_LITERAL.test(text)) score += 1;
		if (TYPE_ANNOTATION.test(text)) score += 1;
		if (ASYNC_FUNCTION.test(text)) score += 1;
		if (DECORATOR.test(text)) score += 1;
		if (GENERICS.test(text)) score += 1;

		// Structural signals
		const semicolonCount: number = (text.match(SEMICOLON_LINES) ?? []).length;
		if (semicolonCount >= 2) score += 1;

		return score;
	}
}
