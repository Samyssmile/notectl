import { describe, expect, it } from 'vitest';
import { RegexTokenizer } from '../RegexTokenizer.js';
import { JSON_LANGUAGE } from './json.js';

// --- Helpers ---

function tokenize(code: string): readonly { from: number; to: number; type: string }[] {
	const tokenizer = new RegexTokenizer([JSON_LANGUAGE]);
	return tokenizer.tokenize(code, 'json');
}

function tokenTypes(code: string): readonly string[] {
	return tokenize(code).map((t) => t.type);
}

// --- Tests ---

describe('JSON language definition', () => {
	describe('language metadata', () => {
		it('has name "json"', () => {
			expect(JSON_LANGUAGE.name).toBe('json');
		});

		it('includes "jsonc" alias', () => {
			expect(JSON_LANGUAGE.aliases).toContain('jsonc');
		});
	});

	describe('property keys', () => {
		it('matches property key followed by colon', () => {
			// Arrange & Act
			const tokens = tokenize('"key": "value"');

			// Assert
			expect(tokens[0]?.type).toBe('property');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(5);
		});

		it('matches property key with spaces before colon', () => {
			// Arrange & Act
			const tokens = tokenize('"key" : "value"');

			// Assert
			expect(tokens[0]?.type).toBe('property');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(5);
		});

		it('matches property key with escaped characters', () => {
			// Arrange & Act
			const tokens = tokenize('"k\\"ey": "value"');

			// Assert
			expect(tokens[0]?.type).toBe('property');
		});

		it('matches property key with unicode escapes', () => {
			// Arrange & Act
			const tokens = tokenize('"k\\u0065y": "value"');

			// Assert
			expect(tokens[0]?.type).toBe('property');
		});
	});

	describe('string values', () => {
		it('matches string value (not followed by colon)', () => {
			// Arrange & Act
			const tokens = tokenize('"key": "hello world"');

			// Assert
			const stringToken = tokens.find((t) => t.type === 'string');
			expect(stringToken).toBeDefined();
			expect(stringToken?.from).toBe(7);
			expect(stringToken?.to).toBe(20);
		});

		it('matches empty string', () => {
			// Arrange & Act
			const tokens = tokenize('"key": ""');

			// Assert
			const stringToken = tokens.find((t) => t.type === 'string');
			expect(stringToken).toBeDefined();
		});

		it('matches string with escaped quotes', () => {
			// Arrange & Act
			const tokens = tokenize('"say \\"hi\\""');

			// Assert
			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('string');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(12);
		});

		it('matches string with escaped backslash', () => {
			// Arrange & Act
			const tokens = tokenize('"path\\\\dir"');

			// Assert
			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('string');
		});

		it('matches string with escaped newline characters', () => {
			// Arrange & Act
			const tokens = tokenize('"line1\\nline2"');

			// Assert
			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('string');
		});

		it('matches string with unicode escape sequences', () => {
			// Arrange & Act
			const tokens = tokenize('"\\u0041\\u0042"');

			// Assert
			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('string');
		});
	});

	describe('numbers', () => {
		it('matches integer', () => {
			// Arrange & Act
			const tokens = tokenize('42');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 2, type: 'number' }]);
		});

		it('matches zero', () => {
			// Arrange & Act
			const tokens = tokenize('0');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 1, type: 'number' }]);
		});

		it('matches negative number', () => {
			// Arrange & Act
			const tokens = tokenize('-7');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 2, type: 'number' }]);
		});

		it('matches decimal number', () => {
			// Arrange & Act
			const tokens = tokenize('3.14');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 4, type: 'number' }]);
		});

		it('matches scientific notation with positive exponent', () => {
			// Arrange & Act
			const tokens = tokenize('1.5e10');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 6, type: 'number' }]);
		});

		it('matches scientific notation with negative exponent', () => {
			// Arrange & Act
			const tokens = tokenize('2.5e-3');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 6, type: 'number' }]);
		});

		it('matches scientific notation with explicit positive exponent', () => {
			// Arrange & Act
			const tokens = tokenize('1E+5');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 4, type: 'number' }]);
		});

		it('matches negative decimal with exponent', () => {
			// Arrange & Act
			const tokens = tokenize('-0.5e2');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 6, type: 'number' }]);
		});
	});

	describe('booleans', () => {
		it('matches true', () => {
			// Arrange & Act
			const tokens = tokenize('true');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 4, type: 'boolean' }]);
		});

		it('matches false', () => {
			// Arrange & Act
			const tokens = tokenize('false');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 5, type: 'boolean' }]);
		});

		it('does not match "trueish" (word boundary enforced)', () => {
			// Arrange & Act
			const tokens = tokenize('trueish');

			// Assert
			const boolTokens = tokens.filter((t) => t.type === 'boolean');
			expect(boolTokens).toEqual([]);
		});
	});

	describe('null', () => {
		it('matches null', () => {
			// Arrange & Act
			const tokens = tokenize('null');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 4, type: 'null' }]);
		});

		it('does not match "nullable" (word boundary enforced)', () => {
			// Arrange & Act
			const tokens = tokenize('nullable');

			// Assert
			const nullTokens = tokens.filter((t) => t.type === 'null');
			expect(nullTokens).toEqual([]);
		});
	});

	describe('punctuation', () => {
		it('matches opening brace', () => {
			// Arrange & Act
			const tokens = tokenize('{');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches closing brace', () => {
			// Arrange & Act
			const tokens = tokenize('}');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches opening bracket', () => {
			// Arrange & Act
			const tokens = tokenize('[');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches closing bracket', () => {
			// Arrange & Act
			const tokens = tokenize(']');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches colon', () => {
			// Arrange & Act
			const tokens = tokenize(':');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches comma', () => {
			// Arrange & Act
			const tokens = tokenize(',');

			// Assert
			expect(tokens).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});
	});

	describe('complex JSON', () => {
		it('tokenizes a complete JSON object with all value types', () => {
			// Arrange
			const json = '{"name": "Alice", "age": 30, "active": true, "data": null}';

			// Act
			const types = tokenTypes(json);

			// Assert
			expect(types).toContain('property');
			expect(types).toContain('string');
			expect(types).toContain('number');
			expect(types).toContain('boolean');
			expect(types).toContain('null');
			expect(types).toContain('punctuation');
		});

		it('tokenizes nested objects', () => {
			// Arrange
			const json = '{"user": {"name": "Bob"}}';

			// Act
			const tokens = tokenize(json);

			// Assert
			const propertyTokens = tokens.filter((t) => t.type === 'property');
			expect(propertyTokens.length).toBe(2);
		});

		it('tokenizes arrays', () => {
			// Arrange
			const json = '[1, 2, 3]';

			// Act
			const tokens = tokenize(json);

			// Assert
			const numberTokens = tokens.filter((t) => t.type === 'number');
			expect(numberTokens.length).toBe(3);

			const punctuationTokens = tokens.filter((t) => t.type === 'punctuation');
			// [ , , ]
			expect(punctuationTokens.length).toBe(4);
		});

		it('tokenizes mixed arrays with different types', () => {
			// Arrange
			const json = '["hello", 42, true, null]';

			// Act
			const types = tokenTypes(json);

			// Assert
			expect(types).toContain('string');
			expect(types).toContain('number');
			expect(types).toContain('boolean');
			expect(types).toContain('null');
		});

		it('differentiates property from string value correctly', () => {
			// Arrange
			const json = '"key": "value"';

			// Act
			const tokens = tokenize(json);

			// Assert
			expect(tokens[0]?.type).toBe('property');
			// The colon is punctuation, then the value is a string
			const stringTokens = tokens.filter((t) => t.type === 'string');
			expect(stringTokens.length).toBe(1);
		});
	});
});
