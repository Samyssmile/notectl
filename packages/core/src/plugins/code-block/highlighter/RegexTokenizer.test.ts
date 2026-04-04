import { describe, expect, it } from 'vitest';
import { RegexTokenizer } from './RegexTokenizer.js';
import type { LanguageDefinition } from './TokenizerTypes.js';
import { JSON_LANGUAGE } from './languages/json.js';

// --- Helpers ---

function makeSimpleLang(): LanguageDefinition {
	return {
		name: 'simple',
		aliases: ['simp'],
		patterns: [
			{ type: 'keyword', pattern: /(?:if|else|return)\b/y },
			{ type: 'number', pattern: /\d+/y },
			{ type: 'string', pattern: /"[^"]*"/y },
		],
	};
}

// --- Tests ---

describe('RegexTokenizer', () => {
	describe('tokenize', () => {
		it('returns no tokens for empty string', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([makeSimpleLang()]);

			// Act
			const tokens = tokenizer.tokenize('', 'simple');

			// Assert
			expect(tokens).toEqual([]);
		});

		it('returns empty array for unknown language', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([makeSimpleLang()]);

			// Act
			const tokens = tokenizer.tokenize('if (true) return 1', 'unknown');

			// Assert
			expect(tokens).toEqual([]);
		});

		it('identifies tokens by position', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([makeSimpleLang()]);

			// Act
			const tokens = tokenizer.tokenize('return 42', 'simple');

			// Assert
			expect(tokens).toEqual([
				{ from: 0, to: 6, type: 'keyword' },
				{ from: 7, to: 9, type: 'number' },
			]);
		});

		it('skips unrecognized characters', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([makeSimpleLang()]);

			// Act
			const tokens = tokenizer.tokenize('x = 5', 'simple');

			// Assert
			expect(tokens).toEqual([{ from: 4, to: 5, type: 'number' }]);
		});

		it('matches aliases case-insensitively', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([makeSimpleLang()]);

			// Act
			const tokens = tokenizer.tokenize('return 1', 'SIMP');

			// Assert
			expect(tokens.length).toBe(2);
			expect(tokens[0]?.type).toBe('keyword');
		});

		it('matches language name case-insensitively', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([makeSimpleLang()]);

			// Act
			const tokens = tokenizer.tokenize('42', 'Simple');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 2, type: 'number' }]);
		});

		it('handles code with no matching tokens', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([makeSimpleLang()]);

			// Act
			const tokens = tokenizer.tokenize('+++', 'simple');

			// Assert
			expect(tokens).toEqual([]);
		});
	});

	describe('JSON tokenization', () => {
		it('tokenizes JSON property keys', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([JSON_LANGUAGE]);

			// Act
			const tokens = tokenizer.tokenize('"name": "Alice"', 'json');

			// Assert
			const propertyToken = tokens.find((t) => t.type === 'property');
			expect(propertyToken).toBeDefined();
			expect(propertyToken?.from).toBe(0);
			expect(propertyToken?.to).toBe(6);
		});

		it('tokenizes JSON string values', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([JSON_LANGUAGE]);

			// Act
			const tokens = tokenizer.tokenize('"name": "Alice"', 'json');

			// Assert
			const stringToken = tokens.find((t) => t.type === 'string');
			expect(stringToken).toBeDefined();
			expect(stringToken?.from).toBe(8);
			expect(stringToken?.to).toBe(15);
		});

		it('tokenizes JSON numbers', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([JSON_LANGUAGE]);

			// Act
			const tokens = tokenizer.tokenize('"age": 30', 'json');

			// Assert
			const numberToken = tokens.find((t) => t.type === 'number');
			expect(numberToken).toBeDefined();
			expect(numberToken?.from).toBe(7);
			expect(numberToken?.to).toBe(9);
		});

		it('tokenizes JSON booleans', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([JSON_LANGUAGE]);

			// Act
			const tokens = tokenizer.tokenize('"active": true', 'json');

			// Assert
			const boolToken = tokens.find((t) => t.type === 'boolean');
			expect(boolToken).toBeDefined();
			expect(boolToken?.from).toBe(10);
			expect(boolToken?.to).toBe(14);
		});

		it('tokenizes JSON null', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([JSON_LANGUAGE]);

			// Act
			const tokens = tokenizer.tokenize('"value": null', 'json');

			// Assert
			const nullToken = tokens.find((t) => t.type === 'null');
			expect(nullToken).toBeDefined();
			expect(nullToken?.from).toBe(9);
			expect(nullToken?.to).toBe(13);
		});

		it('tokenizes JSON punctuation', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([JSON_LANGUAGE]);

			// Act
			const tokens = tokenizer.tokenize('{}', 'json');

			// Assert
			expect(tokens).toEqual([
				{ from: 0, to: 1, type: 'punctuation' },
				{ from: 1, to: 2, type: 'punctuation' },
			]);
		});

		it('tokenizes nested JSON correctly', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([JSON_LANGUAGE]);
			const code = '{"a": {"b": 1}}';

			// Act
			const tokens = tokenizer.tokenize(code, 'json');

			// Assert
			const types: readonly string[] = tokens.map((t) => t.type);
			expect(types).toContain('property');
			expect(types).toContain('punctuation');
			expect(types).toContain('number');
		});

		it('tokenizes escaped strings', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([JSON_LANGUAGE]);

			// Act
			const tokens = tokenizer.tokenize('"say \\"hello\\""', 'json');

			// Assert
			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('string');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(15);
		});

		it('tokenizes scientific notation numbers', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([JSON_LANGUAGE]);

			// Act
			const tokens = tokenizer.tokenize('1.5e10', 'json');

			// Assert
			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('number');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(6);
		});

		it('recognizes jsonc alias', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([JSON_LANGUAGE]);

			// Act
			const tokens = tokenizer.tokenize('42', 'jsonc');

			// Assert
			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('number');
		});
	});

	describe('getSupportedLanguages', () => {
		it('returns registered language names and aliases', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([makeSimpleLang()]);

			// Act
			const languages = tokenizer.getSupportedLanguages();

			// Assert
			expect(languages).toContain('simple');
			expect(languages).toContain('simp');
		});

		it('returns empty when no languages registered', () => {
			// Arrange
			const tokenizer = new RegexTokenizer();

			// Act
			const languages = tokenizer.getSupportedLanguages();

			// Assert
			expect(languages).toEqual([]);
		});

		it('includes all aliases from multiple languages', () => {
			// Arrange
			const lang1: LanguageDefinition = {
				name: 'typescript',
				aliases: ['ts'],
				patterns: [],
			};
			const lang2: LanguageDefinition = {
				name: 'javascript',
				aliases: ['js', 'jsx'],
				patterns: [],
			};
			const tokenizer = new RegexTokenizer([lang1, lang2]);

			// Act
			const languages = tokenizer.getSupportedLanguages();

			// Assert
			expect(languages).toContain('typescript');
			expect(languages).toContain('ts');
			expect(languages).toContain('javascript');
			expect(languages).toContain('js');
			expect(languages).toContain('jsx');
		});
	});

	describe('registerLanguage', () => {
		it('makes a new language available for tokenization', () => {
			// Arrange
			const tokenizer = new RegexTokenizer();
			const lang: LanguageDefinition = {
				name: 'custom',
				aliases: ['cst'],
				patterns: [{ type: 'number', pattern: /\d+/y }],
			};

			// Act
			tokenizer.registerLanguage(lang);
			const tokens = tokenizer.tokenize('42', 'custom');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 2, type: 'number' }]);
		});

		it('makes language available via alias', () => {
			// Arrange
			const tokenizer = new RegexTokenizer();
			const lang: LanguageDefinition = {
				name: 'custom',
				aliases: ['cst'],
				patterns: [{ type: 'number', pattern: /\d+/y }],
			};

			// Act
			tokenizer.registerLanguage(lang);
			const tokens = tokenizer.tokenize('42', 'cst');

			// Assert
			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('number');
		});

		it('shows newly registered language in getSupportedLanguages', () => {
			// Arrange
			const tokenizer = new RegexTokenizer();
			const lang: LanguageDefinition = {
				name: 'custom',
				aliases: ['cst'],
				patterns: [],
			};

			// Act
			tokenizer.registerLanguage(lang);
			const languages = tokenizer.getSupportedLanguages();

			// Assert
			expect(languages).toContain('custom');
			expect(languages).toContain('cst');
		});

		it('overwrites existing language definition', () => {
			// Arrange
			const tokenizer = new RegexTokenizer([makeSimpleLang()]);
			const updated: LanguageDefinition = {
				name: 'simple',
				aliases: ['simp'],
				patterns: [{ type: 'identifier', pattern: /[a-z]+/y }],
			};

			// Act
			tokenizer.registerLanguage(updated);
			const tokens = tokenizer.tokenize('hello', 'simple');

			// Assert
			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('identifier');
		});
	});

	describe('constructor', () => {
		it('accepts no arguments', () => {
			// Arrange & Act
			const tokenizer = new RegexTokenizer();

			// Assert
			expect(tokenizer.getSupportedLanguages()).toEqual([]);
		});

		it('accepts multiple language definitions', () => {
			// Arrange
			const lang1: LanguageDefinition = {
				name: 'lang1',
				aliases: [],
				patterns: [],
			};
			const lang2: LanguageDefinition = {
				name: 'lang2',
				aliases: [],
				patterns: [],
			};

			// Act
			const tokenizer = new RegexTokenizer([lang1, lang2]);

			// Assert
			const languages = tokenizer.getSupportedLanguages();
			expect(languages).toContain('lang1');
			expect(languages).toContain('lang2');
		});
	});
});
