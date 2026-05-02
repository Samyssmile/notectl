/**
 * TypeScript language definition for regex-based syntax highlighting.
 *
 * Covers modern TypeScript syntax including interfaces, type aliases, enums,
 * generics, decorators, async/await, optional chaining, nullish coalescing,
 * template literals, and JSX-friendly punctuation.
 *
 * Token type mapping:
 * - `comment` - line `//`, block, and JSDoc comments
 * - `string` - double/single-quoted strings, template literals
 * - `annotation` - decorators `@Name`, `@module.Name`
 * - `keyword` - JS/TS keywords (control flow, declarations, modifiers)
 * - `boolean` - `true`, `false`
 * - `null` - `null`, `undefined`
 * - `number` - decimal, hex, octal, binary, BigInt, scientific, with separators
 * - `function` - function/method names (identifier followed by `(` or `<...>(`)
 * - `operator` - all TS operators including `=>`, `??`, `?.`, `**`, `>>>=`
 * - `punctuation` - delimiters `{}[]();.,`
 *
 * Aliases: `ts`, `tsx`.
 */

import type { LanguageDefinition } from '../TokenizerTypes.js';

const TYPESCRIPT_KEYWORDS: readonly string[] = [
	'abstract',
	'any',
	'as',
	'asserts',
	'async',
	'await',
	'bigint',
	'boolean',
	'break',
	'case',
	'catch',
	'class',
	'const',
	'constructor',
	'continue',
	'debugger',
	'declare',
	'default',
	'delete',
	'do',
	'else',
	'enum',
	'export',
	'extends',
	'finally',
	'for',
	'from',
	'function',
	'get',
	'global',
	'if',
	'implements',
	'import',
	'in',
	'infer',
	'instanceof',
	'interface',
	'is',
	'keyof',
	'let',
	'module',
	'namespace',
	'never',
	'new',
	'number',
	'object',
	'of',
	'out',
	'override',
	'package',
	'private',
	'protected',
	'public',
	'readonly',
	'require',
	'return',
	'satisfies',
	'set',
	'static',
	'string',
	'super',
	'switch',
	'symbol',
	'this',
	'throw',
	'try',
	'type',
	'typeof',
	'unique',
	'unknown',
	'using',
	'var',
	'void',
	'while',
	'with',
	'yield',
];

const KEYWORD_PATTERN: RegExp = new RegExp(`(?:${TYPESCRIPT_KEYWORDS.join('|')})\\b`, 'y');

export const TYPESCRIPT_LANGUAGE: LanguageDefinition = {
	name: 'typescript',
	aliases: ['ts', 'tsx'],
	patterns: [
		// 1. Block/JSDoc comments — before `/` operator
		{ type: 'comment', pattern: /\/\*[\s\S]*?\*\//y },
		// 2. Line comments — before `/` operator
		{ type: 'comment', pattern: /\/\/[^\n]*/y },
		// 3. Template literals (no nested ${} parsing) — escape-aware
		{ type: 'string', pattern: /`(?:[^`\\$]|\\.|\$(?!\{)|\$\{[^}]*\})*`/y },
		// 4. Double-quoted strings — escape-aware
		{ type: 'string', pattern: /"(?:[^"\\]|\\.)*"/y },
		// 5. Single-quoted strings — escape-aware
		{ type: 'string', pattern: /'(?:[^'\\]|\\.)*'/y },
		// 6. Decorators — before operators
		{ type: 'annotation', pattern: /@[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*/y },
		// 7. Keywords — before functions (`if(` = keyword, not function)
		{ type: 'keyword', pattern: KEYWORD_PATTERN },
		// 8. Booleans
		{ type: 'boolean', pattern: /(?:true|false)\b/y },
		// 9. Null/undefined
		{ type: 'null', pattern: /(?:null|undefined)\b/y },
		// 10. Hex numbers (with optional BigInt suffix) — before decimal
		{ type: 'number', pattern: /0[xX][\da-fA-F](?:_*[\da-fA-F])*n?/y },
		// 11. Binary numbers — before decimal
		{ type: 'number', pattern: /0[bB][01](?:_*[01])*n?/y },
		// 12. Octal numbers — before decimal
		{ type: 'number', pattern: /0[oO][0-7](?:_*[0-7])*n?/y },
		// 13. Decimal/float/scientific/BigInt — with numeric separator support
		{
			type: 'number',
			pattern: /\d(?:_*\d)*(?:\.(?:\d(?:_*\d)*)?)?(?:[eE][+-]?\d(?:_*\d)*)?n?/y,
		},
		// 14. Function/method names — identifier followed by `(`
		{ type: 'function', pattern: /[a-zA-Z_$][\w$]*(?=\s*\()/y },
		// 15. Operators — longer alternatives first (alternation picks first match, not longest)
		{
			type: 'operator',
			pattern:
				/(?:>>>=?|>>=?|<<=?|\*\*=?|\?\?=?|\|\|=?|&&=?|===?|!==?|=>|\?\.|\.\.\.|\+\+|--|[+\-*/%&|^~!=<>]=?|\?|:)/y,
		},
		// 16. Punctuation — catch-all delimiters
		{ type: 'punctuation', pattern: /[{}[\]();.,]/y },
	],
};
