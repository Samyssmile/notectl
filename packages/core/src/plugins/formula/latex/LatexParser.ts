/**
 * Recursive-descent LaTeX parser emitting Presentation MathML strings.
 *
 * Layer A (framework-agnostic, zero notectl imports). Consumes the token stream
 * and produces an array of top-level atoms. Per-category commands (fractions,
 * accents, fonts, spacing, environments) are delegated to handler modules; the
 * core owns the expression loop, group parsing, script attachment and big-
 * operator limit placement. Never throws: malformed input is recovered and
 * recorded as a `LatexError`, and unknown commands become a visible `merror`.
 */

import {
	element,
	group,
	mi,
	mn,
	mo,
	mover,
	mrow,
	msub,
	msubsup,
	msup,
	mtext,
	munder,
	munderover,
} from '../mathml/index.js';
import { atom, bigOpAtom } from './LatexParserTypes.js';
import type { Atom, ParserApi } from './LatexParserTypes.js';
import { SymbolKind, lookupSymbol, resolveDelimiter } from './LatexSymbols.js';
import type { SymbolEntry } from './LatexSymbols.js';
import type { LatexError } from './LatexToMathML.js';
import { TokenType, isControlSymbol, tokenize } from './LatexTokenizer.js';
import type { Token } from './LatexTokenizer.js';
import { isAccent, parseAccent } from './handlers/Accents.js';
import {
	parseBegin,
	parseLeftRight,
	parsePmod,
	parseStrayRight,
	parseSubstack,
} from './handlers/Delimiters.js';
import { isFontCommand, parseFontCommand } from './handlers/Fonts.js';
import { isSpacing, nbSpaceMarkup, spacingMarkup } from './handlers/Spacing.js';
import {
	isBinom,
	isFraction,
	isStack,
	parseBinom,
	parseFraction,
	parseSqrt,
	parseStack,
} from './handlers/Structures.js';

const PRIME = '′';

/** Integral-family glyphs whose limits remain side scripts even in display. */
const INTEGRAL_CHARS: ReadonlySet<string> = new Set(['∫', '∬', '∭', '∮']);

/** Parses a LaTeX source string into top-level atoms plus collected errors. */
export function parseLatex(
	src: string,
	display: boolean,
): { readonly atoms: readonly Atom[]; readonly errors: readonly LatexError[] } {
	const parser = new LatexParser(src, tokenize(src), display);
	const atoms: readonly Atom[] = parser.parseTopLevel();
	return { atoms, errors: parser.collectedErrors };
}

class LatexParser implements ParserApi {
	private readonly source: string;
	private readonly tokens: readonly Token[];
	private pos = 0;
	private readonly errors: LatexError[] = [];
	public readonly display: boolean;

	public constructor(source: string, tokens: readonly Token[], display: boolean) {
		this.source = source;
		this.tokens = tokens;
		this.display = display;
	}

	public get collectedErrors(): readonly LatexError[] {
		return this.errors;
	}

	public peek(): Token | undefined {
		return this.tokens[this.pos];
	}

	public next(): Token | undefined {
		const tok: Token | undefined = this.tokens[this.pos];
		if (tok !== undefined) this.pos += 1;
		return tok;
	}

	public error(err: LatexError): void {
		this.errors.push(err);
	}

	/**
	 * Parses the whole input. Stray closing braces (which have no matching open
	 * at the top level) are consumed and recorded rather than ending the parse,
	 * so trailing content is not silently dropped.
	 */
	public parseTopLevel(): readonly Atom[] {
		const atoms: Atom[] = [];
		while (true) {
			const tok: Token | undefined = this.peek();
			if (tok === undefined) break;
			if (tok.type === TokenType.GroupClose) {
				this.next();
				this.error({ message: 'Unmatched brace', position: tok.position });
				continue;
			}
			const next: Atom | undefined = this.parseAtomWithScripts();
			if (next !== undefined) atoms.push(next);
		}
		return atoms;
	}

	/**
	 * Parses a flat sequence of atoms until `stop` matches the upcoming token or
	 * EOF is reached. The stopping token is left unconsumed.
	 */
	public parseExpression(stop: (token: Token) => boolean): readonly Atom[] {
		const atoms: Atom[] = [];
		while (true) {
			const tok: Token | undefined = this.peek();
			if (tok === undefined || stop(tok)) break;
			if (tok.type === TokenType.GroupClose) break;
			const next: Atom | undefined = this.parseAtomWithScripts();
			if (next !== undefined) atoms.push(next);
		}
		return atoms;
	}

	public parseAtomsUntil(stop: (token: Token) => boolean): readonly Atom[] {
		return this.parseExpression(stop);
	}

	/** Parses a base atom, then attaches any trailing scripts (`^`, `_`, `'`). */
	private parseAtomWithScripts(): Atom | undefined {
		const base: Atom | undefined = this.parseBaseAtom();
		if (base === undefined) return undefined;
		return this.attachScripts(base);
	}

	private attachScripts(base: Atom): Atom {
		let sub: string | undefined;
		let sup: string | undefined;
		let primes = '';
		let limitsOverride: 'limits' | 'nolimits' | undefined;
		while (true) {
			const tok: Token | undefined = this.peek();
			if (tok === undefined) break;
			if (tok.type === TokenType.Prime) {
				this.next();
				primes += PRIME;
				continue;
			}
			if (tok.type === TokenType.Command && tok.value === 'limits') {
				this.next();
				limitsOverride = 'limits';
				continue;
			}
			if (tok.type === TokenType.Command && tok.value === 'nolimits') {
				this.next();
				limitsOverride = 'nolimits';
				continue;
			}
			if (tok.type === TokenType.Superscript) {
				this.next();
				sup = this.combineSup(sup, this.parseArgument());
				continue;
			}
			if (tok.type === TokenType.Subscript) {
				this.next();
				sub = this.combineSub(sub, this.parseArgument());
				continue;
			}
			break;
		}
		// Primes precede any explicit superscript: `f'^2` → f with sup `′2`.
		if (primes) sup = sup === undefined ? mo(primes) : mrow(`${mo(primes)}${sup}`);
		if (sub === undefined && sup === undefined) return base;
		return atom(this.buildScripts(base, sub, sup, limitsOverride));
	}

	private combineSup(existing: string | undefined, next: string): string {
		if (existing === undefined) return next;
		this.error({ message: 'Double superscript' });
		return mrow(`${existing}${next}`);
	}

	private combineSub(existing: string | undefined, next: string): string {
		if (existing === undefined) return next;
		this.error({ message: 'Double subscript' });
		return mrow(`${existing}${next}`);
	}

	private buildScripts(
		base: Atom,
		sub: string | undefined,
		sup: string | undefined,
		override: 'limits' | 'nolimits' | undefined,
	): string {
		const limitsByDefault: boolean = base.bigOp === true && base.intLike !== true && this.display;
		const useLimits: boolean =
			override === 'limits' || (override !== 'nolimits' && limitsByDefault);
		if (useLimits) {
			if (sub !== undefined && sup !== undefined) return munderover(base.node, sub, sup);
			if (sub !== undefined) return munder(base.node, sub);
			if (sup !== undefined) return mover(base.node, sup);
		}
		if (sub !== undefined && sup !== undefined) return msubsup(base.node, sub, sup);
		if (sub !== undefined) return msub(base.node, sub);
		if (sup !== undefined) return msup(base.node, sup);
		return base.node;
	}

	private parseBaseAtom(): Atom | undefined {
		const tok: Token | undefined = this.next();
		if (tok === undefined) return undefined;
		switch (tok.type) {
			case TokenType.Number:
				return atom(mn(tok.value));
			case TokenType.Char:
				return this.parseChar(tok.value);
			case TokenType.GroupOpen:
				return this.parseGroup();
			case TokenType.NbSpace:
				return atom(nbSpaceMarkup());
			case TokenType.Command:
				return this.parseCommand(tok);
			case TokenType.Superscript:
			case TokenType.Subscript:
			case TokenType.Prime:
				// A script with no preceding base: attach to an empty box (mrow).
				this.pos -= 1;
				return this.attachScripts(atom(mrow('')));
			case TokenType.Ampersand:
			case TokenType.RowBreak:
			case TokenType.GroupClose:
				return undefined;
			default:
				return undefined;
		}
	}

	private parseGroup(): Atom {
		const atoms: readonly Atom[] = this.parseExpression(() => false);
		this.expect(TokenType.GroupClose);
		return atom(group(atoms.map((a) => a.node)));
	}

	private parseChar(ch: string): Atom {
		const delim: SymbolEntry | undefined = resolveDelimiter(ch);
		if (delim && (delim.kind === SymbolKind.Open || delim.kind === SymbolKind.Close)) {
			return atom(mo(ch, { fence: true }), delim.kind);
		}
		if (ch === '+' || ch === '-' || ch === '*' || ch === '=' || ch === '/' || ch === '|') {
			return atom(mo(ch));
		}
		if (ch === ',' || ch === ';' || ch === '.' || ch === ':' || ch === '!' || ch === '?') {
			return atom(mo(ch));
		}
		if (ch === '<' || ch === '>') return atom(mo(ch));
		return atom(mi(ch));
	}

	private parseCommand(tok: Token): Atom | undefined {
		const name: string = tok.value;
		const symbol: SymbolEntry | undefined = lookupSymbol(name);
		if (symbol) return this.symbolAtom(symbol);
		if (isControlSymbol(name)) return this.controlSymbolAtom(name);
		const structural: Atom | undefined = this.dispatchStructural(name);
		if (structural !== undefined) return structural;
		const special: Atom | undefined = this.dispatchSpecial(name, tok);
		if (special !== undefined) return special;
		// Unknown command: visible, accessible error marker plus a record.
		this.error({ message: 'Unknown command', command: `\\${name}`, position: tok.position });
		return atom(element('merror', mtext(`\\${name}`)));
	}

	private dispatchStructural(name: string): Atom | undefined {
		if (isFraction(name)) return parseFraction(this);
		if (isBinom(name)) return parseBinom(this);
		if (name === 'sqrt') return parseSqrt(this);
		if (isStack(name)) return parseStack(name, this);
		if (isAccent(name)) return parseAccent(name, this);
		if (isFontCommand(name)) return parseFontCommand(name, this);
		if (isSpacing(name)) {
			const markup: string | undefined = spacingMarkup(name);
			return markup === undefined ? undefined : atom(markup);
		}
		return undefined;
	}

	private dispatchSpecial(name: string, tok: Token): Atom | undefined {
		if (name === 'left') return parseLeftRight(this);
		if (name === 'begin') return parseBegin(this);
		if (name === 'pmod') return parsePmod(this);
		if (name === 'bmod') return atom(mo('mod', { lspace: '0.222em', rspace: '0.222em' }));
		if (name === 'mod') return atom(mo('mod', { lspace: '0.222em', rspace: '0.222em' }));
		if (name === 'substack') return parseSubstack(this);
		if (name === 'right') return parseStrayRight(this, tok.position);
		return undefined;
	}

	private symbolAtom(symbol: SymbolEntry): Atom {
		switch (symbol.kind) {
			case SymbolKind.Ordinary:
				return atom(mi(symbol.char), symbol.kind);
			case SymbolKind.Function:
				return atom(mi(symbol.char, { mathvariant: 'normal' }), symbol.kind);
			case SymbolKind.BigOp:
				return this.bigOperator(symbol);
			case SymbolKind.Open:
			case SymbolKind.Close:
				return atom(mo(symbol.char, { fence: true }), symbol.kind);
			default:
				return atom(mo(symbol.char), symbol.kind);
		}
	}

	private bigOperator(symbol: SymbolEntry): Atom {
		// Multi-letter big operators (lim, max, …) render upright like functions.
		const multiLetter: boolean = /[a-z]/i.test(symbol.char);
		if (multiLetter) {
			return bigOpAtom(mo(symbol.char, { movablelimits: true }), symbol.kind);
		}
		const intLike: boolean = INTEGRAL_CHARS.has(symbol.char);
		const node: string = mo(symbol.char, { movablelimits: true, largeop: true });
		return bigOpAtom(node, symbol.kind, intLike);
	}

	private controlSymbolAtom(name: string): Atom | undefined {
		// `\ ` (control space) and other spacing escapes route through mspace.
		if (isSpacing(name)) {
			const markup: string | undefined = spacingMarkup(name);
			return markup === undefined ? undefined : atom(markup);
		}
		if (name === '{') return atom(mo('{', { fence: true }), SymbolKind.Open);
		if (name === '}') return atom(mo('}', { fence: true }), SymbolKind.Close);
		if (name === '|') return atom(mo('‖'));
		if (name === '\\') return atom(mo('\\'));
		if (name === '/') return atom(mo('/'));
		if (name === "'") return atom(mo(PRIME));
		if (name === '.') return atom(mo('.'));
		// Escaped literal punctuation: \% \$ \# \& \_
		return atom(mtext(name));
	}

	public parseArgument(): string {
		return nonEmpty(this.parseArgumentRaw());
	}

	private parseArgumentRaw(): string {
		const tok: Token | undefined = this.peek();
		if (tok === undefined) return '';
		if (tok.type === TokenType.GroupOpen) {
			this.next();
			const atoms: readonly Atom[] = this.parseExpression(() => false);
			this.expect(TokenType.GroupClose);
			return group(atoms.map((a) => a.node));
		}
		// Single-token argument: parse exactly one base atom (with no scripts).
		const single: Atom | undefined = this.parseBaseAtom();
		return single?.node ?? '';
	}

	public parseOptionalArgument(): string | undefined {
		const tok: Token | undefined = this.peek();
		if (tok === undefined || tok.type !== TokenType.Char || tok.value !== '[') return undefined;
		this.next();
		const atoms: readonly Atom[] = this.parseExpression(
			(t) => t.type === TokenType.Char && t.value === ']',
		);
		const closing: Token | undefined = this.peek();
		if (closing !== undefined && closing.type === TokenType.Char && closing.value === ']') {
			this.next();
		}
		return group(atoms.map((a) => a.node));
	}

	public parseRawArgument(): string {
		const tok: Token | undefined = this.peek();
		if (tok === undefined) return '';
		if (tok.type !== TokenType.GroupOpen) {
			this.next();
			return tok.value;
		}
		const openPos: number = tok.position;
		this.next();
		// Walk tokens tracking brace depth so we can slice the original source
		// (whitespace the tokenizer dropped is recovered, e.g. `\text{if }`).
		let depth = 1;
		let closePos: number = this.source.length;
		while (true) {
			const cur: Token | undefined = this.next();
			if (cur === undefined) break;
			if (cur.type === TokenType.GroupOpen) depth += 1;
			else if (cur.type === TokenType.GroupClose) {
				depth -= 1;
				if (depth === 0) {
					closePos = cur.position;
					break;
				}
			}
		}
		return this.source.slice(openPos + 1, closePos);
	}

	private expect(type: TokenType): void {
		const tok: Token | undefined = this.peek();
		if (tok !== undefined && tok.type === type) {
			this.next();
			return;
		}
		if (type === TokenType.GroupClose) {
			this.error({ message: 'Unmatched brace' });
		}
	}
}

/** Ensures a structural argument slot holds exactly one element, never empty. */
function nonEmpty(markup: string): string {
	return markup === '' ? mrow('') : markup;
}
