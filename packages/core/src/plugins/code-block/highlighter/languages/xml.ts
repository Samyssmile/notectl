/**
 * XML language definition for regex-based syntax highlighting.
 *
 * Token type mapping:
 * - `comment` — XML comments `<!-- ... -->`
 * - `keyword` — tag names (consumed with `<`/`</` prefix), processing instructions, CDATA
 * - `property` — attribute names (identifier followed by `=`)
 * - `string` — attribute values (double or single quoted)
 * - `punctuation` — delimiters `/>`, `>`, `=`
 *
 * Tag names are combined with their `<` or `</` prefix into a single `keyword` token
 * to prevent text content between tags from being incorrectly highlighted.
 */

import { XML_TAG_NAME } from '../../../shared/XmlPatterns.js';
import type { LanguageDefinition } from '../TokenizerTypes.js';

export const XML_LANGUAGE: LanguageDefinition = {
	name: 'xml',
	aliases: ['html', 'xhtml', 'svg', 'xsl'],
	patterns: [
		{ type: 'comment', pattern: /^<!--[\s\S]*?-->/ },
		{ type: 'keyword', pattern: /^<!\[CDATA\[[\s\S]*?\]\]>/ },
		{ type: 'keyword', pattern: /^<\?[\s\S]*?\?>/ },
		{ type: 'keyword', pattern: new RegExp(`^<\\/${XML_TAG_NAME}`) },
		{ type: 'keyword', pattern: new RegExp(`^<${XML_TAG_NAME}`) },
		{ type: 'punctuation', pattern: /^\/>|^>|^=/ },
		{ type: 'property', pattern: new RegExp(`^${XML_TAG_NAME}(?=\\s*=)`) },
		{ type: 'string', pattern: /^"[^"]*"/ },
		{ type: 'string', pattern: /^'[^']*'/ },
	],
};
