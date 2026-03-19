/**
 * Java language definition for regex-based syntax highlighting.
 *
 * Covers Java 21 syntax including sealed classes, records, pattern matching,
 * modules, text blocks, and switch expressions.
 *
 * Token type mapping:
 * - `comment` - line `//`, block, and Javadoc comments
 * - `string` - double-quoted strings, text blocks, char literals
 * - `annotation` - annotations `@Name`, `@java.lang.Override`
 * - `keyword` - Java 21 keywords (including contextual: sealed, record, var, yield, when)
 * - `boolean` - `true`, `false`
 * - `null` - `null`
 * - `number` - decimal, hex, binary, float, scientific, with underscores
 * - `function` - method/function names (identifier followed by `(`)
 * - `operator` - all Java operators including `->`, `::`, `>>>=`
 * - `punctuation` - delimiters `{}[]();.,`
 */

import type { LanguageDefinition } from '../TokenizerTypes.js';

const JAVA_KEYWORDS: readonly string[] = [
	'abstract',
	'assert',
	'break',
	'case',
	'catch',
	'class',
	'const',
	'continue',
	'default',
	'do',
	'else',
	'enum',
	'exports',
	'extends',
	'final',
	'finally',
	'for',
	'goto',
	'if',
	'implements',
	'import',
	'instanceof',
	'interface',
	'module',
	'native',
	'new',
	'non-sealed',
	'open',
	'opens',
	'package',
	'permits',
	'private',
	'protected',
	'provides',
	'public',
	'record',
	'requires',
	'return',
	'sealed',
	'static',
	'strictfp',
	'super',
	'switch',
	'synchronized',
	'this',
	'throw',
	'throws',
	'to',
	'transient',
	'transitive',
	'try',
	'uses',
	'var',
	'void',
	'volatile',
	'when',
	'while',
	'with',
	'yield',
];

const KEYWORD_PATTERN: RegExp = new RegExp(`^(?:${JAVA_KEYWORDS.join('|')})\\b`);

export const JAVA_LANGUAGE: LanguageDefinition = {
	name: 'java',
	aliases: [],
	patterns: [
		// 1. Block/Javadoc comments — before `/` operator
		{ type: 'comment', pattern: /^\/\*[\s\S]*?\*\// },
		// 2. Line comments — before `/` operator
		{ type: 'comment', pattern: /^\/\/[^\n]*/ },
		// 3. Text blocks `"""..."""` — before empty string `""`
		{ type: 'string', pattern: /^"""[\s\S]*?"""/ },
		// 4. Double-quoted strings — escape-aware
		{ type: 'string', pattern: /^"(?:[^"\\]|\\.)*"/ },
		// 5. Char literals — escape-aware
		{ type: 'string', pattern: /^'(?:[^'\\]|\\.)*'/ },
		// 6. Annotations — before operators (captures `@`)
		{ type: 'annotation', pattern: /^@[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*/ },
		// 7. Keywords — before functions (`if(` = keyword, not function)
		{ type: 'keyword', pattern: KEYWORD_PATTERN },
		// 8. Booleans
		{ type: 'boolean', pattern: /^(?:true|false)\b/ },
		// 9. Null
		{ type: 'null', pattern: /^null\b/ },
		// 10. Hex numbers — before decimal (both can start with `0`)
		{ type: 'number', pattern: /^0[xX][\da-fA-F](?:_*[\da-fA-F])*[lL]?/ },
		// 11. Binary numbers — before decimal
		{ type: 'number', pattern: /^0[bB][01](?:_*[01])*[lL]?/ },
		// 12. Decimal/float/scientific numbers — with underscore and suffix support
		{
			type: 'number',
			pattern: /^\d(?:_*\d)*(?:\.(?:\d(?:_*\d)*)?)?(?:[eE][+-]?\d(?:_*\d)*)?[fFdDlL]?/,
		},
		// 13. Function/method names — identifier followed by `(`
		{ type: 'function', pattern: /^[a-zA-Z_]\w*(?=\s*\()/ },
		// 14. Operators
		{
			type: 'operator',
			pattern: /^(?:>>>=?|>>=?|<<=?|->|::|\+\+|--|&&|\|\||[+\-*/%&|^~!=<>]=?|\?|:)/,
		},
		// 15. Punctuation — catch-all delimiters
		{ type: 'punctuation', pattern: /^[{}[\]();.,]/ },
	],
};
