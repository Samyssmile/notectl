/**
 * Built-in TypeScript language support bundle.
 * Includes syntax highlighting (modern TS) and lexer-based smart-paste detection.
 *
 * Aliases `ts` and `tsx` are accepted for the language picker and code-block fences.
 *
 * Detection re-uses the same `TYPESCRIPT_LANGUAGE` token definition that
 * powers highlighting — see `LexerDetector` for the algorithm. Smoking-gun
 * signatures encode constructs that are syntactically impossible in Java:
 * `import … from '…'`, `type X = …` aliases, `declare …` ambients,
 * `: <lowercase-primitive>` type annotations, and the `export` statement
 * starter for declarations.
 */

import { TYPESCRIPT_LANGUAGE } from '../../code-block/highlighter/languages/typescript.js';
import { LexerDetector } from '../../smart-paste/detectors/LexerDetector.js';
import type { LanguageSupport } from '../LanguageTypes.js';

const TYPESCRIPT_SIGNATURES: readonly RegExp[] = [
	/^[ \t]*import\b[^;\n]*?\bfrom\s+['"]/m,
	/^[ \t]*(?:export\s+)?type\s+\w+(?:\s*<[^=>]*>)?\s*=/m,
	/^[ \t]*declare\s+(?:const|let|var|function|class|namespace|module|global)\b/m,
	/[\w$\])]\??\s*:\s*(?:string|number|boolean|void|any|unknown|never|bigint|symbol|object|null|undefined)\b/,
	/^[ \t]*export\s+(?:default\s+|const\s+|let\s+|var\s+|function\s+|async\s+function\b|class\s+|interface\s+|enum\s+|namespace\s+|abstract\s+class\b|\*\s+from\b|\{)/m,
];

export const TYPESCRIPT_SUPPORT: LanguageSupport = {
	id: 'typescript',
	displayName: 'TypeScript',
	aliases: ['ts', 'tsx'],
	highlighting: TYPESCRIPT_LANGUAGE,
	detection: new LexerDetector(TYPESCRIPT_LANGUAGE, { signatures: TYPESCRIPT_SIGNATURES }),
};
