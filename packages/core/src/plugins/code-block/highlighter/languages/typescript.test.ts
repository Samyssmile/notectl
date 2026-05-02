import { describe, expect, it } from 'vitest';
import { RegexTokenizer } from '../RegexTokenizer.js';
import { TYPESCRIPT_LANGUAGE } from './typescript.js';

// --- Helpers ---

function tokenize(code: string): readonly { from: number; to: number; type: string }[] {
	const tokenizer = new RegexTokenizer([TYPESCRIPT_LANGUAGE]);
	return tokenizer.tokenize(code, 'typescript');
}

function tokenTypes(code: string): readonly string[] {
	return tokenize(code).map((t) => t.type);
}

// --- Tests ---

describe('TypeScript language definition', () => {
	describe('language metadata', () => {
		it('has name "typescript"', () => {
			expect(TYPESCRIPT_LANGUAGE.name).toBe('typescript');
		});

		it('exposes ts and tsx aliases', () => {
			expect(TYPESCRIPT_LANGUAGE.aliases).toContain('ts');
			expect(TYPESCRIPT_LANGUAGE.aliases).toContain('tsx');
		});

		it('is registered under each alias', () => {
			const tokenizer = new RegexTokenizer([TYPESCRIPT_LANGUAGE]);
			expect(tokenizer.tokenize('const', 'ts').length).toBeGreaterThan(0);
			expect(tokenizer.tokenize('const', 'tsx').length).toBeGreaterThan(0);
		});
	});

	describe('comments', () => {
		it('matches line comment', () => {
			const tokens = tokenize('// hello');

			expect(tokens).toEqual([{ from: 0, to: 8, type: 'comment' }]);
		});

		it('matches block comment', () => {
			const tokens = tokenize('/* block */');

			expect(tokens).toEqual([{ from: 0, to: 11, type: 'comment' }]);
		});

		it('matches JSDoc comment', () => {
			const tokens = tokenize('/** @returns number */');

			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('comment');
		});

		it('matches multiline block comment', () => {
			const tokens = tokenize('/*\n * line\n */');

			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('comment');
		});
	});

	describe('strings', () => {
		it('matches double-quoted string', () => {
			const tokens = tokenize('"hello"');

			expect(tokens).toEqual([{ from: 0, to: 7, type: 'string' }]);
		});

		it('matches single-quoted string', () => {
			const tokens = tokenize("'hello'");

			expect(tokens).toEqual([{ from: 0, to: 7, type: 'string' }]);
		});

		it('matches string with escaped quote', () => {
			const tokens = tokenize('"say \\"hi\\""');

			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('string');
			expect(tokens[0]?.to).toBe(12);
		});

		it('matches template literal', () => {
			const tokens = tokenize('`hello ${name}`');

			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('string');
		});

		it('matches plain template literal without interpolation', () => {
			const tokens = tokenize('`raw text`');

			expect(tokens).toEqual([{ from: 0, to: 10, type: 'string' }]);
		});

		it('matches multiline template literal', () => {
			const tokens = tokenize('`first\nsecond`');

			expect(tokens.length).toBe(1);
			expect(tokens[0]?.type).toBe('string');
		});
	});

	describe('decorators', () => {
		it('matches simple decorator', () => {
			const tokens = tokenize('@Component');

			expect(tokens).toEqual([{ from: 0, to: 10, type: 'annotation' }]);
		});

		it('matches qualified decorator', () => {
			const tokens = tokenize('@core.Inject');

			expect(tokens).toEqual([{ from: 0, to: 12, type: 'annotation' }]);
		});

		it('matches decorator with $ identifier', () => {
			const tokens = tokenize('@$inject');

			expect(tokens[0]?.type).toBe('annotation');
		});
	});

	describe('keywords', () => {
		it('matches type-system keywords', () => {
			for (const kw of ['interface', 'type', 'enum', 'namespace', 'declare', 'abstract']) {
				const tokens = tokenize(kw);
				expect(tokens[0]?.type).toBe('keyword');
			}
		});

		it('matches modifier keywords', () => {
			for (const kw of ['public', 'private', 'protected', 'readonly', 'override', 'static']) {
				const tokens = tokenize(kw);
				expect(tokens[0]?.type).toBe('keyword');
			}
		});

		it('matches type-operator keywords', () => {
			for (const kw of ['keyof', 'typeof', 'infer', 'is', 'asserts', 'satisfies']) {
				const tokens = tokenize(kw);
				expect(tokens[0]?.type).toBe('keyword');
			}
		});

		it('matches async/await', () => {
			expect(tokenize('async')[0]?.type).toBe('keyword');
			expect(tokenize('await')[0]?.type).toBe('keyword');
		});

		it('matches const/let/var', () => {
			expect(tokenize('const')[0]?.type).toBe('keyword');
			expect(tokenize('let')[0]?.type).toBe('keyword');
			expect(tokenize('var')[0]?.type).toBe('keyword');
		});

		it('matches import/export/from', () => {
			expect(tokenize('import')[0]?.type).toBe('keyword');
			expect(tokenize('export')[0]?.type).toBe('keyword');
			expect(tokenize('from')[0]?.type).toBe('keyword');
		});

		it('enforces word boundary — interfaceName is not keyword', () => {
			const tokens = tokenize('interfaceName');

			const keywordTokens = tokens.filter((t) => t.type === 'keyword');
			expect(keywordTokens).toEqual([]);
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

	describe('null/undefined', () => {
		it('matches null', () => {
			const tokens = tokenize('null');

			expect(tokens).toEqual([{ from: 0, to: 4, type: 'null' }]);
		});

		it('matches undefined', () => {
			const tokens = tokenize('undefined');

			expect(tokens).toEqual([{ from: 0, to: 9, type: 'null' }]);
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

		it('matches hex number', () => {
			const tokens = tokenize('0xFF');

			expect(tokens).toEqual([{ from: 0, to: 4, type: 'number' }]);
		});

		it('matches binary number', () => {
			const tokens = tokenize('0b1010');

			expect(tokens).toEqual([{ from: 0, to: 6, type: 'number' }]);
		});

		it('matches octal number', () => {
			const tokens = tokenize('0o755');

			expect(tokens).toEqual([{ from: 0, to: 5, type: 'number' }]);
		});

		it('matches BigInt', () => {
			const tokens = tokenize('100n');

			expect(tokens).toEqual([{ from: 0, to: 4, type: 'number' }]);
		});

		it('matches hex BigInt', () => {
			const tokens = tokenize('0xFFn');

			expect(tokens).toEqual([{ from: 0, to: 5, type: 'number' }]);
		});

		it('matches scientific notation', () => {
			const tokens = tokenize('1.5e10');

			expect(tokens).toEqual([{ from: 0, to: 6, type: 'number' }]);
		});

		it('matches numeric separators', () => {
			const tokens = tokenize('1_000_000');

			expect(tokens).toEqual([{ from: 0, to: 9, type: 'number' }]);
		});

		it('matches float literal', () => {
			const tokens = tokenize('3.14');

			expect(tokens).toEqual([{ from: 0, to: 4, type: 'number' }]);
		});
	});

	describe('functions', () => {
		it('matches function call', () => {
			const tokens = tokenize('greet("hi")');

			expect(tokens[0]?.type).toBe('function');
			expect(tokens[0]?.from).toBe(0);
			expect(tokens[0]?.to).toBe(5);
		});

		it('matches identifier with $', () => {
			const tokens = tokenize('$emit()');

			expect(tokens[0]?.type).toBe('function');
			expect(tokens[0]?.to).toBe(5);
		});

		it('does not match keyword "if" as function', () => {
			const tokens = tokenize('if (x)');

			expect(tokens[0]?.type).toBe('keyword');
		});

		it('matches method after dot', () => {
			const tokens = tokenize('.toString()');

			const fnTokens = tokens.filter((t) => t.type === 'function');
			expect(fnTokens.length).toBe(1);
			expect(fnTokens[0]?.from).toBe(1);
		});
	});

	describe('operators', () => {
		it('matches arrow function', () => {
			const tokens = tokenize('=>');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches nullish coalescing', () => {
			const tokens = tokenize('??');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches nullish-coalescing assignment', () => {
			const tokens = tokenize('??=');

			expect(tokens).toEqual([{ from: 0, to: 3, type: 'operator' }]);
		});

		it('matches optional chaining', () => {
			const tokens = tokenize('?.');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches spread/rest', () => {
			const tokens = tokenize('...');

			expect(tokens).toEqual([{ from: 0, to: 3, type: 'operator' }]);
		});

		it('matches strict equality', () => {
			const tokens = tokenize('===');

			expect(tokens).toEqual([{ from: 0, to: 3, type: 'operator' }]);
		});

		it('matches strict inequality', () => {
			const tokens = tokenize('!==');

			expect(tokens).toEqual([{ from: 0, to: 3, type: 'operator' }]);
		});

		it('matches loose equality', () => {
			const tokens = tokenize('==');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches exponent operator', () => {
			const tokens = tokenize('**');

			expect(tokens).toEqual([{ from: 0, to: 2, type: 'operator' }]);
		});

		it('matches exponent assignment', () => {
			const tokens = tokenize('**=');

			expect(tokens).toEqual([{ from: 0, to: 3, type: 'operator' }]);
		});

		it('matches unsigned right shift assignment', () => {
			const tokens = tokenize('>>>=');

			expect(tokens).toEqual([{ from: 0, to: 4, type: 'operator' }]);
		});

		it('matches logical AND assignment', () => {
			const tokens = tokenize('&&=');

			expect(tokens).toEqual([{ from: 0, to: 3, type: 'operator' }]);
		});

		it('matches logical OR assignment', () => {
			const tokens = tokenize('||=');

			expect(tokens).toEqual([{ from: 0, to: 3, type: 'operator' }]);
		});

		it('matches single-char operators', () => {
			for (const op of ['+', '-', '*', '/', '%', '!', '=', '<', '>', '?', ':']) {
				const tokens = tokenize(op);
				expect(tokens[0]?.type).toBe('operator');
				expect(tokens[0]?.to).toBe(1);
			}
		});
	});

	describe('punctuation', () => {
		it('matches braces', () => {
			expect(tokenize('{')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
			expect(tokenize('}')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches brackets', () => {
			expect(tokenize('[')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
			expect(tokenize(']')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches parens', () => {
			expect(tokenize('(')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
			expect(tokenize(')')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});

		it('matches semicolon, comma, dot', () => {
			expect(tokenize(';')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
			expect(tokenize(',')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
			expect(tokenize('.')).toEqual([{ from: 0, to: 1, type: 'punctuation' }]);
		});
	});

	describe('complex TypeScript', () => {
		it('tokenizes interface declaration', () => {
			const code = 'interface Point { x: number; y: number; }';
			const types = tokenTypes(code);

			expect(types).toContain('keyword'); // interface, number
			expect(types).toContain('punctuation');
			expect(types).toContain('operator'); // :
		});

		it('tokenizes type alias with union', () => {
			const code = 'type Result = string | number;';
			const types = tokenTypes(code);

			expect(types[0]).toBe('keyword'); // type
			expect(types).toContain('operator'); // |
		});

		it('tokenizes arrow function', () => {
			const code = 'const add = (a: number, b: number): number => a + b;';
			const tokens = tokenize(code);
			const types = tokens.map((t) => t.type);

			expect(types[0]).toBe('keyword'); // const
			expect(types).toContain('operator'); // =>
		});

		it('tokenizes async function', () => {
			const code = 'async function fetchData(): Promise<void> {}';
			const tokens = tokenize(code);

			expect(tokens[0]?.type).toBe('keyword'); // async
			expect(tokens[1]?.type).toBe('keyword'); // function
			expect(tokens[2]?.type).toBe('function'); // fetchData
		});

		it('tokenizes decorator on class', () => {
			const code = '@Component class Widget {}';
			const tokens = tokenize(code);

			expect(tokens[0]?.type).toBe('annotation'); // @Component
			expect(tokens[1]?.type).toBe('keyword'); // class
		});

		it('tokenizes optional chaining and nullish coalescing', () => {
			const code = 'const x = obj?.prop ?? defaultValue;';
			const types = tokenTypes(code);

			const ops = types.filter((t) => t === 'operator');
			expect(ops.length).toBeGreaterThanOrEqual(3); // =, ?., ??
		});

		it('tokenizes template literal with interpolation', () => {
			const code = 'const msg = `Hello ${name}`;';
			const tokens = tokenize(code);

			expect(tokens[0]?.type).toBe('keyword'); // const
			expect(tokens.some((t) => t.type === 'string')).toBe(true);
		});

		it('tokenizes generic function call', () => {
			const code = 'JSON.parse("{}")';
			const tokens = tokenize(code);

			const fnTokens = tokens.filter((t) => t.type === 'function');
			expect(fnTokens.length).toBe(1); // parse
		});

		it('tokenizes export with type-only modifier', () => {
			const code = 'export type Foo = string;';
			const types = tokenTypes(code);

			expect(types[0]).toBe('keyword'); // export
			expect(types[1]).toBe('keyword'); // type
		});

		it('tokenizes real-world TS snippet', () => {
			const code =
				"import { describe } from 'vitest';\n\nexport class Greeter {\n    private readonly name: string;\n\n    constructor(name: string) {\n        this.name = name;\n    }\n\n    greet(): string {\n        return `Hello, ${this.name}!`;\n    }\n}";
			const types = tokenTypes(code);

			expect(types).toContain('keyword');
			expect(types).toContain('string');
			expect(types).toContain('function');
			expect(types).toContain('punctuation');
			expect(types).toContain('operator');
		});
	});
});
