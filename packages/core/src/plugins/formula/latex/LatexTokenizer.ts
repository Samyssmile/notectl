/**
 * LaTeX math-mode tokenizer for the zero-dependency converter.
 *
 * Layer A (framework-agnostic, zero notectl imports). Splits a LaTeX source
 * string into a flat token list the parser consumes. Pure string work, no DOM.
 */

/** The lexical category of a token. */
export enum TokenType {
	/** A `\name` command or control symbol (e.g. `\frac`, `\,`, `\{`). */
	Command = 'command',
	/** Group open `{`. */
	GroupOpen = 'groupOpen',
	/** Group close `}`. */
	GroupClose = 'groupClose',
	/** Superscript marker `^`. */
	Superscript = 'superscript',
	/** Subscript marker `_`. */
	Subscript = 'subscript',
	/** Prime marker `'`. */
	Prime = 'prime',
	/** Alignment tab `&` (matrix/cases cell separator). */
	Ampersand = 'ampersand',
	/** Row break `\\` (matrix/cases row separator). */
	RowBreak = 'rowBreak',
	/** A non-breaking space `~`. */
	NbSpace = 'nbSpace',
	/** A run of digits (and a trailing decimal point group). */
	Number = 'number',
	/** A single ordinary character (letter, punctuation, operator char). */
	Char = 'char',
}

/** A single lexical token with its source position. */
export interface Token {
	/** The lexical category. */
	readonly type: TokenType;
	/** The raw value: command name without backslash, or the literal char(s). */
	readonly value: string;
	/** Zero-based index in the source where the token starts. */
	readonly position: number;
}

/** Single-character control symbols that form a one-char command after `\`. */
const CONTROL_SYMBOLS: ReadonlySet<string> = new Set([
	'{',
	'}',
	'%',
	'$',
	'#',
	'&',
	'_',
	',',
	':',
	';',
	'!',
	' ',
	'|',
	'\\',
	'.',
	'/',
	"'",
	'~',
	'^',
]);

function isLetter(ch: string): boolean {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isDigit(ch: string): boolean {
	return ch >= '0' && ch <= '9';
}

function isWhitespace(ch: string): boolean {
	return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function token(type: TokenType, value: string, position: number): Token {
	return { type, value, position };
}

function readCommand(src: string, start: number): Token {
	const next: string | undefined = src[start + 1];
	// Control symbol: backslash followed by a single non-letter (e.g. \{ \, \\).
	if (next !== undefined && !isLetter(next)) {
		if (next === '\\') return token(TokenType.RowBreak, '\\', start);
		return token(TokenType.Command, next, start);
	}
	// Lettered command: backslash followed by one or more letters.
	let end: number = start + 1;
	while (end < src.length) {
		const ch: string | undefined = src[end];
		if (ch === undefined || !isLetter(ch)) break;
		end += 1;
	}
	return token(TokenType.Command, src.slice(start + 1, end), start);
}

function readNumber(src: string, start: number): Token {
	let end: number = start;
	while (end < src.length) {
		const ch: string | undefined = src[end];
		if (ch === undefined || !isDigit(ch)) break;
		end += 1;
	}
	// Absorb a decimal point that is immediately followed by another digit.
	if (src[end] === '.' && src[end + 1] !== undefined && isDigit(src[end + 1] ?? '')) {
		end += 1;
		while (end < src.length) {
			const ch: string | undefined = src[end];
			if (ch === undefined || !isDigit(ch)) break;
			end += 1;
		}
	}
	return token(TokenType.Number, src.slice(start, end), start);
}

/** Tokenizes a LaTeX math string. Never throws; unknown chars become `Char`. */
export function tokenize(src: string): readonly Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < src.length) {
		const ch: string = src[i] ?? '';
		if (ch === '\\') {
			const cmd: Token = readCommand(src, i);
			tokens.push(cmd);
			// Advance past the backslash and the command body.
			i += cmd.type === TokenType.RowBreak ? 2 : Math.max(1, cmd.value.length) + 1;
			// Swallow whitespace after a lettered command (single- or multi-letter),
			// e.g. `\alpha x` → `\alpha`,`x`; not after a control symbol like `\,`.
			if (cmd.type === TokenType.Command && isLetter(cmd.value[0] ?? '')) {
				while (i < src.length && isWhitespace(src[i] ?? '')) i += 1;
			}
			continue;
		}
		if (isDigit(ch)) {
			const num: Token = readNumber(src, i);
			tokens.push(num);
			i += num.value.length;
			continue;
		}
		if (isWhitespace(ch)) {
			i += 1;
			continue;
		}
		const simple: Token | undefined = simpleToken(ch, i);
		if (simple) tokens.push(simple);
		i += 1;
	}
	return tokens;
}

function simpleToken(ch: string, position: number): Token | undefined {
	switch (ch) {
		case '{':
			return token(TokenType.GroupOpen, ch, position);
		case '}':
			return token(TokenType.GroupClose, ch, position);
		case '^':
			return token(TokenType.Superscript, ch, position);
		case '_':
			return token(TokenType.Subscript, ch, position);
		case "'":
			return token(TokenType.Prime, ch, position);
		case '&':
			return token(TokenType.Ampersand, ch, position);
		case '~':
			return token(TokenType.NbSpace, ch, position);
		default:
			return token(TokenType.Char, ch, position);
	}
}

/** True when a one-character command body is a recognized control symbol. */
export function isControlSymbol(value: string): boolean {
	return value.length === 1 && CONTROL_SYMBOLS.has(value);
}
