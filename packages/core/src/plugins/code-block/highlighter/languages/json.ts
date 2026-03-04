/**
 * JSON language definition for regex-based syntax highlighting.
 */

import type { LanguageDefinition } from '../TokenizerTypes.js';

export const JSON_LANGUAGE: LanguageDefinition = {
	name: 'json',
	aliases: ['jsonc'],
	patterns: [
		{ type: 'property', pattern: /^"(?:[^"\\]|\\.)*"(?=\s*:)/ },
		{ type: 'string', pattern: /^"(?:[^"\\]|\\.)*"/ },
		{ type: 'number', pattern: /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/ },
		{ type: 'boolean', pattern: /^(?:true|false)\b/ },
		{ type: 'null', pattern: /^null\b/ },
		{ type: 'punctuation', pattern: /^[{}[\]:,]/ },
	],
};
