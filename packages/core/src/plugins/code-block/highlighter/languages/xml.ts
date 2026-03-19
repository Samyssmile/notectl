/**
 * XML language definition for regex-based syntax highlighting.
 *
 * Token type mapping:
 * - `comment` — XML comments `<!-- ... -->`
 * - `keyword` — processing instructions, CDATA sections
 * - `tag` — tag names (consumed with `<`/`</` prefix)
 * - `attribute` — attribute names (identifier followed by `=`)
 * - `string` — attribute values (double or single quoted)
 * - `punctuation` — delimiters `/>`, `>`, `=`
 *
 * Tag names are combined with their `<` or `</` prefix into a single `tag` token
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
		{ type: 'tag', pattern: new RegExp(`^<\\/${XML_TAG_NAME}`) },
		{ type: 'tag', pattern: new RegExp(`^<${XML_TAG_NAME}`) },
		{ type: 'punctuation', pattern: /^\/>|^>|^=/ },
		{ type: 'attribute', pattern: new RegExp(`^${XML_TAG_NAME}(?=\\s*=)`) },
		{ type: 'string', pattern: /^"[^"]*"/ },
		{ type: 'string', pattern: /^'[^']*'/ },
	],
};
