export { CodeBlockPlugin } from './CodeBlockPlugin.js';
export {
	CODE_BLOCK_SERVICE_KEY,
	SYNTAX_HIGHLIGHTER_SERVICE_KEY,
	type CodeBlockConfig,
	type CodeBlockKeymap,
	type CodeBlockService,
	type SyntaxHighlighter,
	type SyntaxHighlighterService,
	type SyntaxToken,
} from './CodeBlockTypes.js';

export type { CodeBlockLocale } from './CodeBlockLocale.js';
export {
	CODE_BLOCK_LOCALE_EN,
	loadCodeBlockLocale,
} from './CodeBlockLocale.js';

export { RegexTokenizer } from './highlighter/RegexTokenizer.js';
export type { LanguageDefinition, TokenPattern } from './highlighter/TokenizerTypes.js';
export { JSON_LANGUAGE } from './highlighter/languages/json.js';
export { XML_LANGUAGE } from './highlighter/languages/xml.js';
