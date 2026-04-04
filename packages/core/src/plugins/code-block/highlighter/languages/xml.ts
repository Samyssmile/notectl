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
		{ type: 'comment', pattern: /<!--[\s\S]*?-->/y },
		{ type: 'keyword', pattern: /<!\[CDATA\[[\s\S]*?\]\]>/y },
		{ type: 'keyword', pattern: /<\?[\s\S]*?\?>/y },
		{ type: 'tag', pattern: new RegExp(`<\\/${XML_TAG_NAME}`, 'y') },
		{ type: 'tag', pattern: new RegExp(`<${XML_TAG_NAME}`, 'y') },
		{ type: 'punctuation', pattern: /\/>|>|=/y },
		{ type: 'attribute', pattern: new RegExp(`${XML_TAG_NAME}(?=\\s*=)`, 'y') },
		{ type: 'string', pattern: /"[^"]*"/y },
		{ type: 'string', pattern: /'[^']*'/y },
	],
};
