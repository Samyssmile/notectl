/**
 * JSON language definition for regex-based syntax highlighting.
 */

import type { LanguageDefinition } from '../TokenizerTypes.js';

export const JSON_LANGUAGE: LanguageDefinition = {
	name: 'json',
	aliases: ['jsonc'],
	patterns: [
		{ type: 'property', pattern: /"(?:[^"\\]|\\.)*"(?=\s*:)/y },
		{ type: 'string', pattern: /"(?:[^"\\]|\\.)*"/y },
		{ type: 'number', pattern: /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y },
		{ type: 'boolean', pattern: /(?:true|false)\b/y },
		{ type: 'null', pattern: /null\b/y },
		{ type: 'punctuation', pattern: /[{}[\]:,]/y },
	],
};
