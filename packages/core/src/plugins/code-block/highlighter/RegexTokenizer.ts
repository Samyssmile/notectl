/**
 * Regex-based syntax tokenizer.
 * Implements the SyntaxHighlighter interface using linear regex scanning
 * with sticky (`y`-flagged) regexes to avoid O(n) substring allocations per position.
 */

import type { SyntaxHighlighter, SyntaxToken } from '../CodeBlockTypes.js';
import type { LanguageDefinition } from './TokenizerTypes.js';

export class RegexTokenizer implements SyntaxHighlighter {
	private readonly languageMap = new Map<string, LanguageDefinition>();

	constructor(languages?: readonly LanguageDefinition[]) {
		if (languages) {
			for (const lang of languages) {
				this.registerLanguageInternal(lang);
			}
		}
	}

	/** Registers a language definition. Overwrites existing definitions for the same name/aliases. */
	registerLanguage(def: LanguageDefinition): void {
		this.registerLanguageInternal(def);
	}

	/** Tokenizes code using the specified language. Returns empty array for unknown languages. */
	tokenize(code: string, language: string): readonly SyntaxToken[] {
		const lang: LanguageDefinition | undefined = this.languageMap.get(language.toLowerCase());
		if (!lang) return [];

		const tokens: SyntaxToken[] = [];
		let pos = 0;

		while (pos < code.length) {
			let matched = false;

			for (const pattern of lang.patterns) {
				pattern.pattern.lastIndex = pos;
				const match: RegExpExecArray | null = pattern.pattern.exec(code);
				if (match && match.index === pos && match[0].length > 0) {
					tokens.push({
						from: pos,
						to: pos + match[0].length,
						type: pattern.type,
					});
					pos += match[0].length;
					matched = true;
					break;
				}
			}

			if (!matched) {
				pos++;
			}
		}

		return tokens;
	}

	/** Returns all registered language names and aliases. */
	getSupportedLanguages(): readonly string[] {
		const names = new Set<string>();
		for (const lang of this.languageMap.values()) {
			names.add(lang.name);
			for (const alias of lang.aliases) {
				names.add(alias);
			}
		}
		return [...names];
	}

	private registerLanguageInternal(def: LanguageDefinition): void {
		this.languageMap.set(def.name.toLowerCase(), def);
		for (const alias of def.aliases) {
			this.languageMap.set(alias.toLowerCase(), def);
		}
	}
}
