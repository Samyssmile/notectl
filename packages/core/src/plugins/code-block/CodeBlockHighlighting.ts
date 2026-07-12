/**
 * Wires up syntax highlighting for the code-block plugin: selects the active
 * highlighter (the configured one or the built-in {@link RegexTokenizer}),
 * registers the language registry with its bundled languages, and exposes the
 * `SyntaxHighlighterService`. The shared {@link TokenCache} is invalidated
 * whenever a new language is registered.
 */

import type { PluginContext } from '../Plugin.js';
import { LanguageRegistry } from '../language/LanguageRegistry.js';
import { LANGUAGE_REGISTRY_SERVICE_KEY, type LanguageSupport } from '../language/LanguageTypes.js';
import type { CodeBlockConfig, SyntaxHighlighter } from './CodeBlockTypes.js';
import { SYNTAX_HIGHLIGHTER_SERVICE_KEY } from './CodeBlockTypes.js';
import type { TokenCache } from './TokenCache.js';
import { RegexTokenizer } from './highlighter/RegexTokenizer.js';
import { JAVA_LANGUAGE } from './highlighter/languages/java.js';
import { JSON_LANGUAGE } from './highlighter/languages/json.js';
import { TYPESCRIPT_LANGUAGE } from './highlighter/languages/typescript.js';
import { XML_LANGUAGE } from './highlighter/languages/xml.js';

const BUILTIN_HIGHLIGHTING_SUPPORTS: readonly LanguageSupport[] = [
	{
		id: JAVA_LANGUAGE.name,
		displayName: 'Java',
		aliases: JAVA_LANGUAGE.aliases,
		highlighting: JAVA_LANGUAGE,
	},
	{
		id: JSON_LANGUAGE.name,
		displayName: 'JSON',
		aliases: JSON_LANGUAGE.aliases,
		highlighting: JSON_LANGUAGE,
	},
	{
		id: TYPESCRIPT_LANGUAGE.name,
		displayName: 'TypeScript',
		aliases: TYPESCRIPT_LANGUAGE.aliases,
		highlighting: TYPESCRIPT_LANGUAGE,
	},
	{
		id: XML_LANGUAGE.name,
		displayName: 'XML',
		aliases: XML_LANGUAGE.aliases,
		highlighting: XML_LANGUAGE,
	},
];

/**
 * Sets up the highlighter, language registry, and syntax-highlighter service.
 * Returns the active highlighter so the plugin can hand it to the node view and
 * decoration builder.
 */
export function setupHighlighting(
	context: PluginContext,
	config: CodeBlockConfig,
	tokenCache: TokenCache,
): SyntaxHighlighter {
	const highlighter: SyntaxHighlighter = config.highlighter ?? new RegexTokenizer();
	const registeredHighlighting = new Map<string, NonNullable<LanguageSupport['highlighting']>>();

	const languageRegistry = new LanguageRegistry();
	languageRegistry.onRegister((support) => {
		const highlighting = support.highlighting;
		if (
			highlighting &&
			highlighter.registerLanguage &&
			registeredHighlighting.get(support.id) !== highlighting
		) {
			highlighter.registerLanguage(highlighting);
			registeredHighlighting.set(support.id, highlighting);
			tokenCache.clear();
		}
	});
	context.registerService(LANGUAGE_REGISTRY_SERVICE_KEY, languageRegistry);

	for (const support of BUILTIN_HIGHLIGHTING_SUPPORTS) {
		languageRegistry.register(support);
	}

	context.registerService(SYNTAX_HIGHLIGHTER_SERVICE_KEY, {
		registerLanguage: (def) => {
			highlighter.registerLanguage?.(def);
			tokenCache.clear();
		},
		getSupportedLanguages: () => highlighter.getSupportedLanguages(),
		tokenize: (code, language) => highlighter.tokenize(code, language),
		getTokenAt: (blockId, offset) => tokenCache.findTokenAt(blockId, offset),
	});

	return highlighter;
}
