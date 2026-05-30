/**
 * Wires up syntax highlighting for the code-block plugin: selects the active
 * highlighter (the configured one or the built-in {@link RegexTokenizer}),
 * registers the language registry with its bundled languages, and exposes the
 * `SyntaxHighlighterService`. The shared {@link TokenCache} is invalidated
 * whenever a new language is registered.
 */

import type { PluginContext } from '../Plugin.js';
import { LanguageRegistry } from '../language/LanguageRegistry.js';
import { LANGUAGE_REGISTRY_SERVICE_KEY } from '../language/LanguageTypes.js';
import {
	JAVA_SUPPORT,
	JSON_SUPPORT,
	TYPESCRIPT_SUPPORT,
	XML_SUPPORT,
} from '../language/bundles/index.js';
import type { CodeBlockConfig, SyntaxHighlighter } from './CodeBlockTypes.js';
import { SYNTAX_HIGHLIGHTER_SERVICE_KEY } from './CodeBlockTypes.js';
import type { TokenCache } from './TokenCache.js';
import { RegexTokenizer } from './highlighter/RegexTokenizer.js';

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

	const languageRegistry = new LanguageRegistry();
	languageRegistry.onRegister((support) => {
		if (support.highlighting && highlighter.registerLanguage) {
			highlighter.registerLanguage(support.highlighting);
			tokenCache.clear();
		}
	});
	context.registerService(LANGUAGE_REGISTRY_SERVICE_KEY, languageRegistry);

	languageRegistry.register(JAVA_SUPPORT);
	languageRegistry.register(JSON_SUPPORT);
	languageRegistry.register(TYPESCRIPT_SUPPORT);
	languageRegistry.register(XML_SUPPORT);

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
