/**
 * `\begin{env}…\end{env}` environment handlers (matrices, cases, aligned).
 *
 * Layer A (framework-agnostic, zero notectl imports). Splits the body into rows
 * (on `\\`) and cells (on `&`), builds an `mtable`, and wraps it in the fences
 * the environment implies (pmatrix → (), bmatrix → [], cases → brace, …).
 */

import { mo, mrow, mtable } from '../../mathml/index.js';
import { atom } from '../LatexParserTypes.js';
import type { Atom, ParserApi } from '../LatexParserTypes.js';
import { TokenType } from '../LatexTokenizer.js';
import type { Token } from '../LatexTokenizer.js';

interface EnvSpec {
	/** Opening fence glyph, or '' for none. */
	readonly open: string;
	/** Closing fence glyph, or '' for none. */
	readonly close: string;
	/** Default column alignment for the table. */
	readonly columnalign?: string;
}

const ENVIRONMENTS: Readonly<Record<string, EnvSpec>> = {
	matrix: { open: '', close: '' },
	pmatrix: { open: '(', close: ')' },
	bmatrix: { open: '[', close: ']' },
	Bmatrix: { open: '{', close: '}' },
	vmatrix: { open: '|', close: '|' },
	Vmatrix: { open: '‖', close: '‖' },
	cases: { open: '{', close: '', columnalign: 'left' },
	aligned: { open: '', close: '', columnalign: 'right left' },
	align: { open: '', close: '', columnalign: 'right left' },
	gathered: { open: '', close: '', columnalign: 'center' },
	smallmatrix: { open: '', close: '' },
};

/** Returns true when `name` is a supported environment. */
export function isEnvironment(name: string): boolean {
	return name in ENVIRONMENTS || name === 'array';
}

/**
 * Parses an environment body up to its `\end{...}` and returns the table atom.
 * `name` is the environment name captured from `\begin{name}`.
 */
export function parseEnvironment(name: string, api: ParserApi): Atom {
	if (name === 'array') {
		// `array` carries an optional position arg then a mandatory `{cols}`
		// column spec, e.g. `\begin{array}[t]{cc}`. Both are discarded.
		api.parseOptionalArgument();
		api.parseRawArgument();
	}
	const rows: string[][] = collectRows(name, api);
	const cellRows: string[][] = rows.map((row) => row.map((cell) => cell));
	const spec: EnvSpec = ENVIRONMENTS[name] ?? { open: '', close: '' };
	const tableAttrs: Readonly<Record<string, string>> | undefined = spec.columnalign
		? { columnalign: spec.columnalign }
		: undefined;
	const table: string = mtable(cellRows, tableAttrs);
	if (!spec.open && !spec.close) return atom(table);
	const open: string = spec.open ? mo(spec.open, { stretchy: true, fence: true }) : '';
	const close: string = spec.close ? mo(spec.close, { stretchy: true, fence: true }) : '';
	return atom(mrow(`${open}${table}${close}`));
}

function collectRows(envName: string, api: ParserApi): string[][] {
	const rows: string[][] = [];
	let current: string[] = [];
	let cell: string[] = [];
	const flushCell = (): void => {
		current.push(mrow(cell.join('')));
		cell = [];
	};
	const flushRow = (): void => {
		flushCell();
		rows.push(current);
		current = [];
	};
	while (true) {
		const tok: Token | undefined = api.peek();
		if (tok === undefined) {
			api.error({ message: `Unterminated environment \\begin{${envName}}` });
			break;
		}
		if (isEnd(tok)) {
			api.next();
			api.parseRawArgument(); // consume {envName}
			break;
		}
		if (tok.type === TokenType.Ampersand) {
			api.next();
			flushCell();
			continue;
		}
		if (tok.type === TokenType.RowBreak) {
			api.next();
			flushRow();
			continue;
		}
		const atoms: readonly Atom[] = api.parseAtomsUntil(isCellBoundary);
		cell.push(...atoms.map((a) => a.node));
	}
	// Flush the trailing row unless it is an empty artifact of a final `\\`.
	if (cell.length > 0 || current.length > 0) flushRow();
	if (rows.length === 0) rows.push(['']);
	return rows;
}

function isEnd(tok: Token): boolean {
	return tok.type === TokenType.Command && tok.value === 'end';
}

function isCellBoundary(tok: Token): boolean {
	return (
		tok.type === TokenType.Ampersand ||
		tok.type === TokenType.RowBreak ||
		(tok.type === TokenType.Command && tok.value === 'end')
	);
}
