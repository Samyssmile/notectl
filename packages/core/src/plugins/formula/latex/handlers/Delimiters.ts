/**
 * Handlers for delimiter and stacking commands: `\left…\right`, `\begin…\end`,
 * `\substack`, and `\pmod`.
 *
 * Layer A (framework-agnostic, zero notectl imports). These operate purely
 * through the `ParserApi` surface, so they stay decoupled from the parser core.
 */

import { element, group, mo, mrow, mtext } from '../../mathml/index.js';
import { atom } from '../LatexParserTypes.js';
import type { Atom, ParserApi } from '../LatexParserTypes.js';
import { resolveDelimiter } from '../LatexSymbols.js';
import type { SymbolEntry } from '../LatexSymbols.js';
import { TokenType } from '../LatexTokenizer.js';
import type { Token } from '../LatexTokenizer.js';
import { isEnvironment, parseEnvironment } from './Environments.js';
import { nbSpaceMarkup } from './Spacing.js';

/** Parses `\left<delim> … \right<delim>` into a stretchy-fenced group. */
export function parseLeftRight(api: ParserApi): Atom {
	const openEntry: SymbolEntry | undefined = resolveDelimiter(readDelimiterSpec(api));
	const body: readonly Atom[] = api.parseAtomsUntil(isRight);
	const closeTok: Token | undefined = api.peek();
	let closeSpec = '.';
	if (closeTok !== undefined && isRight(closeTok)) {
		api.next();
		closeSpec = readDelimiterSpec(api);
	} else {
		api.error({ message: 'Unmatched \\left' });
	}
	const closeEntry: SymbolEntry | undefined = resolveDelimiter(closeSpec);
	const open: string = fenceMarkup(openEntry);
	const close: string = fenceMarkup(closeEntry);
	return atom(group([open, ...body.map((a) => a.node), close]));
}

/** Handles a stray `\right`: consumes its delimiter and records the mismatch. */
export function parseStrayRight(api: ParserApi, position: number): Atom {
	readDelimiterSpec(api);
	api.error({ message: 'Unmatched \\right', position });
	return atom(group([]));
}

/** Parses `\begin{env} … \end{env}`, dispatching to the environment builder. */
export function parseBegin(api: ParserApi): Atom {
	const envName: string = api.parseRawArgument();
	if (!isEnvironment(envName)) {
		api.error({ message: 'Unknown environment', command: envName });
		return atom(element('merror', mtext(envName)));
	}
	return parseEnvironment(envName, api);
}

/** Parses `\substack{a \\ b}` into a single-column stacked table. */
export function parseSubstack(api: ParserApi): Atom {
	expectGroupOpen(api);
	const rows: string[] = [];
	let cell: string[] = [];
	while (true) {
		const tok: Token | undefined = api.peek();
		if (tok === undefined || tok.type === TokenType.GroupClose) break;
		if (tok.type === TokenType.RowBreak) {
			api.next();
			rows.push(group(cell));
			cell = [];
			continue;
		}
		const atoms: readonly Atom[] = api.parseAtomsUntil((t) => t.type === TokenType.RowBreak);
		cell.push(...atoms.map((a) => a.node));
	}
	consumeGroupClose(api);
	rows.push(group(cell));
	const body: string = rows.map((r) => element('mtr', element('mtd', r))).join('');
	return atom(element('mtable', body));
}

/** Parses `\pmod{n}` into a parenthesized `(mod n)`, wrapped in one mrow. */
export function parsePmod(api: ParserApi): Atom {
	const arg: string = api.parseArgument();
	const open: string = mo('(', { fence: true });
	const close: string = mo(')', { fence: true });
	const body = `${open}${mtext('mod')}${nbSpaceMarkup()}${arg}${close}`;
	return atom(mrow(body));
}

function isRight(tok: Token): boolean {
	return tok.type === TokenType.Command && tok.value === 'right';
}

function readDelimiterSpec(api: ParserApi): string {
	const tok: Token | undefined = api.next();
	if (tok === undefined) return '.';
	if (tok.type === TokenType.Command) return `\\${tok.value}`;
	return tok.value;
}

function fenceMarkup(entry: SymbolEntry | undefined): string {
	// Null delimiter (\left. / \right.): emit nothing; group() joins it away.
	if (!entry || entry.char === '') return '';
	return mo(entry.char, { fence: true, stretchy: true });
}

function expectGroupOpen(api: ParserApi): void {
	const tok: Token | undefined = api.peek();
	if (tok !== undefined && tok.type === TokenType.GroupOpen) api.next();
}

function consumeGroupClose(api: ParserApi): void {
	const tok: Token | undefined = api.peek();
	if (tok !== undefined && tok.type === TokenType.GroupClose) api.next();
}
