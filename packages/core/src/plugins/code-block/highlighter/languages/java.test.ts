import { describe, expect, it } from 'vitest';
import { RegexTokenizer } from '../RegexTokenizer.js';
import { JAVA_LANGUAGE } from './java.js';

// --- Helpers ---

function tokenize(code: string): readonly { from: number; to: number; type: string }[] {
	const tokenizer = new RegexTokenizer([JAVA_LANGUAGE]);
	return tokenizer.tokenize(code, 'java');
}

function tokenTypes(code: string): readonly string[] {
	return tokenize(code).map((t) => t.type);
}

// --- Tests ---

describe('Java language definition', () => {
	describe('language metadata', () => {
		it('has name "java"', () => {
			expect(JAVA_LANGUAGE.name).toBe('java');
		});

		it('has empty aliases', () => {
			expect(JAVA_LANGUAGE.aliases).toEqual([]);
		});
	});

	describe('comments', () => {
		it('matches line comment', () => {
			const tokens = tokenize('// hello');

			expect(tokens).toEqual([{ from: 0, to: 8, type: 'comment' }]);
		});

		it('matches empty line comment', () => {
			const tokens = tokenize('//');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'comment' }]);
		});

		it('matches line comment with special characters', () => {
			const tokens = tokenize('// TODO: fix @Override');

			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('comment');
		});

		it('matches block comment', () => {
			const tokens = tokenize('/* block */');

			expect(tokens).toEqual([{ from: 0, to: 11, type: 'comment' }]);
		});

		it('matches Javadoc comment', () => {
			const tokens = tokenize('/** Javadoc */');

			expect(tokens).toEqual([{ from: 0, to: 14, type: 'comment' }]);
		});

		it('matches multiline block comment', () => {
			const tokens = tokenize('/*\n * line\n */');

			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('comment');
		});

		it('matches comment with stars inside', () => {
			const tokens = tokenize('/* a * b */');

			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('comment');
		});
	});

	describe('strings', () => {
		it('matches double-quoted string', () => {
			const tokens = tokenize('"hello"');

			expect(tokens).toEqual([{ from: 0, to: 7, type: 'string' }]);
		});

		it('matches empty string', () => {
			const tokens = tokenize('""');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'string' }]);
		});

		it('matches string with escaped quote', () => {
			const tokens = tokenize('"say \\"hi\\""');

			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('string');
			expect(tokens[0]?.to).toBe(12);
		});

		it('matches string with escaped backslash', () => {
			const tokens = tokenize('"path\\\\dir"');

			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('string');
		});

		it('matches string with newline escape', () => {
			const tokens = tokenize('"line1\\nline2"');

			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('string');
		});

		it('matches text block', () => {
			const tokens = tokenize('"""\nhello\nworld\n"""');

			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('string');
		});

		it('matches text block before empty string', () => {
			// Text block pattern must come before regular string pattern
			const tokens = tokenize('"""\ntext\n"""');

			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('string');
			expect(tokens[0]?.to).toBe(12);
		});

		it('matches char literal', () => {
			const tokens = tokenize("'a'");

			expect(tokens).toEqual([{ from: 0, to: 3, type: 'string' }]);
		});

		it('matches char literal with escape', () => {
			const tokens = tokenize("'\\n'");

			expect(tokens).toEqual([{ from: 0, to: 4, type: 'string' }]);
		});

		it('matches char literal with unicode escape', () => {
			const tokens = tokenize("'\\u0041'");

			expect(tokens).toEqual([{ from: 0, to: 8, type: 'string' }]);
		});
	});

	describe('annotations', () => {
		it('matches simple annotation', () => {
			const tokens = tokenize('@Override');

			expect(tokens).toEqual([{ from: 0, to: 9, type: 'property' }]);
		});

		it('matches qualified annotation', () => {
			const tokens = tokenize('@java.lang.Override');

			expect(tokens).toEqual([{ from: 0, to: 19, type: 'property' }]);
		});

		it('matches annotation before method', () => {
			const tokens = tokenize('@Override public');

			expect(tokens[0]?.type).toBe('property');
			expect(tokens[0]?.to).toBe(9);
		});

		it('matches annotation with underscore', () => {
			const tokens = tokenize('@SuppressWarnings');

			expect(tokens).toEqual([{ from: 0, to: 17, type: 'property' }]);
		});
	});

	describe('keywords', () => {
		it('matches common keywords', () => {
			for (const kw of ['class', 'public', 'static', 'void', 'return', 'if', 'else']) {
				const tokens = tokenize(kw);
				expect(tokens[0]?.type).toBe('keyword');
			}
		});

		it('matches sealed class keywords', () => {
			for (const kw of ['sealed', 'non-sealed', 'permits']) {
				const tokens = tokenize(kw);
				expect(tokens[0]?.type).toBe('keyword');
			}
		});

		it('matches record keyword', () => {
			const tokens = tokenize('record');

			expect(tokens[0]?.type).toBe('keyword');
		});

		it('matches var keyword', () => {
			const tokens = tokenize('var');

			expect(tokens[0]?.type).toBe('keyword');
		});

		it('matches yield keyword', () => {
			const tokens = tokenize('yield');

			expect(tokens[0]?.type).toBe('keyword');
		});

		it('matches when keyword', () => {
			const tokens = tokenize('when');

			expect(tokens[0]?.type).toBe('keyword');
		});

		it('matches module keywords', () => {
			for (const kw of [
				'module',
				'exports',
				'requires',
				'opens',
				'provides',
				'uses',
				'with',
				'to',
				'transitive',
				'open',
			]) {
				const tokens = tokenize(kw);
				expect(tokens[0]?.type).toBe('keyword');
			}
		});

		it('enforces word boundary — className is not keyword', () => {
			const tokens = tokenize('className');

			const keywordTokens = tokens.filter((t) => t.type === 'keyword');
			expect(keywordTokens).toEqual([]);
		});

		it('enforces word boundary — returned is not keyword', () => {
			const tokens = tokenize('returned');

			const keywordTokens = tokens.filter((t) => t.type === 'keyword');
			expect(keywordTokens).toEqual([]);
		});

		it('matches keyword followed by space', () => {
			const tokens = tokenize('return 42');

			expect(tokens[0]?.type).toBe('keyword');
			expect(tokens[0]?.to).toBe(6);
		});
	});

	describe('booleans', () => {
		it('matches true', () => {
			const tokens = tokenize('true');

			expect(tokens).toEqual([{ from: 0, to: 4, type: 'boolean' }]);
		});

		it('matches false', () => {
			const tokens = tokenize('false');

			expect(tokens).toEqual([{ from: 0, to: 5, type: 'boolean' }]);
		});

		it('does not match "trueValue" (word boundary enforced)', () => {
			const tokens = tokenize('trueValue');

			const boolTokens = tokens.filter((t) => t.type === 'boolean');
			expect(boolTokens).toEqual([]);
		});
	});

	describe('null', () => {
		it('matches null', () => {
			const tokens = tokenize('null');

			expect(tokens).toEqual([{ from: 0, to: 4, type: 'null' }]);
		});

		it('does not match "nullable" (word boundary enforced)', () => {
			const tokens = tokenize('nullable');

			const nullTokens = tokens.filter((t) => t.type === 'null');
			expect(nullTokens).toEqual([]);
		});
	});

	describe('numbers', () => {
		it('matches integer', () => {
			const tokens = tokenize('42');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'number' }]);
		});

		it('matches zero', () => {
			const tokens = tokenize('0');

			expect(tokens).toEqual([{ from: 0, to: 1, type: 'number' }]);
		});

		it('matches long literal', () => {
			const tokens = tokenize('42L');

			expect(tokens).toEqual([{ from: 0, to: 3, type: 'number' }]);
		});

		it('matches hex number', () => {
			const tokens = tokenize('0xFF');

			expect(tokens).toEqual([{ from: 0, to: 4, type: 'number' }]);
		});

		it('matches hex number with long suffix', () => {
			const tokens = tokenize('0xCAFEL');

			expect(tokens).toEqual([{ from: 0, to: 7, type: 'number' }]);
		});

		it('matches binary number', () => {
			const tokens = tokenize('0b1010');

			expect(tokens).toEqual([{ from: 0, to: 6, type: 'number' }]);
		});

		it('matches binary number with long suffix', () => {
			const tokens = tokenize('0B1010L');

			expect(tokens).toEqual([{ from: 0, to: 7, type: 'number' }]);
		});

		it('matches float literal', () => {
			const tokens = tokenize('3.14f');

			expect(tokens).toEqual([{ from: 0, to: 5, type: 'number' }]);
		});

		it('matches double literal', () => {
			const tokens = tokenize('3.14d');

			expect(tokens).toEqual([{ from: 0, to: 5, type: 'number' }]);
		});

		it('matches scientific notation', () => {
			const tokens = tokenize('1.5e10');

			expect(tokens).toEqual([{ from: 0, to: 6, type: 'number' }]);
		});

		it('matches scientific notation with negative exponent', () => {
			const tokens = tokenize('2.5e-3');

			expect(tokens).toEqual([{ from: 0, to: 6, type: 'number' }]);
		});

		it('matches number with underscores', () => {
			const tokens = tokenize('1_000_000');

			expect(tokens).toEqual([{ from: 0, to: 9, type: 'number' }]);
		});

		it('matches hex with underscores', () => {
			const tokens = tokenize('0xFF_FF');

			expect(tokens).toEqual([{ from: 0, to: 7, type: 'number' }]);
		});

		it('matches binary with underscores', () => {
			const tokens = tokenize('0b1010_0101');

			expect(tokens).toEqual([{ from: 0, to: 11, type: 'number' }]);
		});
	});

	describe('functions', () => {
		it('matches method call', () => {
			const tokens = tokenize('println("hi")');

			expect(tokens[0]?.type).toBe('function');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(7);
		});

		it('matches method call with space before paren', () => {
			const tokens = tokenize('foo ()');

			expect(tokens[0]?.type).toBe('function');
			expect(tokens[0]?.to).toBe(3);
		});

		it('does not match keyword as function', () => {
			const tokens = tokenize('if (x)');

			// `if` should be keyword, not function
			expect(tokens[0]?.type).toBe('keyword');
		});

		it('does not match keyword "for" as function', () => {
			const tokens = tokenize('for (int i = 0)');

			expect(tokens[0]?.type).toBe('keyword');
		});

		it('does not match keyword "while" as function', () => {
			const tokens = tokenize('while (true)');

			expect(tokens[0]?.type).toBe('keyword');
		});

		it('matches method after dot', () => {
			// After `.` the tokenizer starts fresh — `getName` should match
			const tokens = tokenize('.getName()');

			const fnTokens = tokens.filter((t) => t.type === 'function');
			expect(fnTokens.length).toBe(1);
			expect(fnTokens[0]?.from).toBe(1);
		});
	});

	describe('operators', () => {
		it('matches lambda arrow', () => {
			const tokens = tokenize('->');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches method reference', () => {
			const tokens = tokenize('::');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches compound assignment', () => {
			const tokens = tokenize('+=');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches unsigned right shift assignment', () => {
			const tokens = tokenize('>>>=');

			expect(tokens).toEqual([{ from: 0, to: 4, type: 'operator' }]);
		});

		it('matches unsigned right shift', () => {
			const tokens = tokenize('>>>');

			expect(tokens).toEqual([{ from: 0, to: 3, type: 'operator' }]);
		});

		it('matches logical AND', () => {
			const tokens = tokenize('&&');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches logical OR', () => {
			const tokens = tokenize('||');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches increment', () => {
			const tokens = tokenize('++');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches decrement', () => {
			const tokens = tokenize('--');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches equality', () => {
			const tokens = tokenize('==');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches not-equal', () => {
			const tokens = tokenize('!=');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches ternary operators', () => {
			const types = tokenTypes('x ? y : z');

			expect(types).toContain('operator');
		});

		it('matches right shift', () => {
			const tokens = tokenize('>>');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches left shift', () => {
			const tokens = tokenize('<<');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});
	});

	describe('punctuation', () => {
		it('matches opening brace', () => {
			expect(tokenize('{')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches closing brace', () => {
			expect(tokenize('}')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches opening bracket', () => {
			expect(tokenize('[')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches closing bracket', () => {
			expect(tokenize(']')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches opening paren', () => {
			expect(tokenize('(')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches closing paren', () => {
			expect(tokenize(')')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches semicolon', () => {
			expect(tokenize(';')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches comma', () => {
			expect(tokenize(',')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches dot', () => {
			expect(tokenize('.')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});
	});

	describe('complex Java', () => {
		it('tokenizes sealed class declaration', () => {
			const code = 'public sealed class Shape permits Circle, Square {';
			const types = tokenTypes(code);

			expect(types.filter((t) => t === 'keyword')).toEqual([
				'keyword', // public
				'keyword', // sealed
				'keyword', // class
				'keyword', // permits
			]);
		});

		it('tokenizes lambda expression', () => {
			const code = 'x -> x + 1';
			const types = tokenTypes(code);

			expect(types).toContain('operator'); // ->
		});

		it('tokenizes annotated method', () => {
			const code = '@Override public void run()';
			const tokens = tokenize(code);

			expect(tokens[0]?.type).toBe('property'); // @Override
			expect(tokens[1]?.type).toBe('keyword'); // public
			expect(tokens[2]?.type).toBe('keyword'); // void
			expect(tokens[3]?.type).toBe('function'); // run
		});

		it('tokenizes for-each with colon', () => {
			const code = 'for (var item : list)';
			const types = tokenTypes(code);

			expect(types).toContain('keyword'); // for, var
			expect(types).toContain('operator'); // :
		});

		it('tokenizes method reference', () => {
			const code = 'System.out::println';
			const tokens = tokenize(code);

			const opTokens = tokens.filter((t) => t.type === 'operator');
			expect(opTokens.some((t) => code.slice(t.from, t.to) === '::')).toBe(true);
		});

		it('tokenizes record declaration', () => {
			const code = 'public record Point(int x, int y) {}';
			const types = tokenTypes(code);

			expect(types[0]).toBe('keyword'); // public
			expect(types[1]).toBe('keyword'); // record
		});

		it('tokenizes real-world class snippet', () => {
			const code =
				'/** A shape. */\npublic sealed class Shape\n    permits Circle {\n\n    @Override\n    public String toString() {\n        return "shape";\n    }\n}';
			const types = tokenTypes(code);

			expect(types).toContain('comment');
			expect(types).toContain('keyword');
			expect(types).toContain('property');
			expect(types).toContain('function');
			expect(types).toContain('string');
			expect(types).toContain('punctuation');
		});

		it('tokenizes switch expression with yield', () => {
			const code = 'switch (x) { case 1 -> yield 42; }';
			const types = tokenTypes(code);

			const keywords = types.filter((t) => t === 'keyword');
			expect(keywords.length).toBeGreaterThanOrEqual(3); // switch, case, yield
		});

		it('tokenizes pattern matching with when', () => {
			const code = 'case String s when s.length() > 0';
			const types = tokenTypes(code);

			expect(types).toContain('keyword'); // case, when
			expect(types).toContain('function'); // length
			expect(types).toContain('operator'); // >
		});
	});
});
