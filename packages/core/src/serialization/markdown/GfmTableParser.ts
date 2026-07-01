/**
 * GFM table detection and row parsing.
 *
 * A table is a header row, a delimiter row (`| --- | :--: |`), and zero or more
 * body rows. Column alignment is derived from the colons in the delimiter row.
 * Cells hold raw inline text, parsed later by the inline tokenizer.
 */

/** Column alignment derived from the delimiter row. */
export type ColumnAlign = 'start' | 'center' | 'end' | null;

/** A parsed GFM table (cells are raw inline strings). */
export interface TableData {
	readonly aligns: readonly ColumnAlign[];
	readonly header: readonly string[];
	readonly rows: readonly (readonly string[])[];
	readonly linesConsumed: number;
}

const DELIMITER_ROW = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** Splits a table row into trimmed cells, honoring escaped `\|` and outer pipes. */
function splitRow(line: string): string[] {
	let s: string = line.trim();
	if (s.startsWith('|')) s = s.slice(1);
	if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);

	const cells: string[] = [];
	let current = '';
	for (let i = 0; i < s.length; i++) {
		const ch: string = s[i] ?? '';
		if (ch === '\\' && s[i + 1] === '|') {
			current += '|';
			i++;
			continue;
		}
		if (ch === '|') {
			cells.push(current.trim());
			current = '';
			continue;
		}
		current += ch;
	}
	cells.push(current.trim());
	return cells;
}

/** Reads the alignment of a single delimiter cell (`:--`, `--:`, `:-:`, `--`). */
function cellAlign(cell: string): ColumnAlign {
	const trimmed: string = cell.trim();
	const left: boolean = trimmed.startsWith(':');
	const right: boolean = trimmed.endsWith(':');
	if (left && right) return 'center';
	if (right) return 'end';
	if (left) return 'start';
	return null;
}

/**
 * Attempts to parse a GFM table beginning at `start`. Returns the table data or
 * null when the two leading lines are not a header + delimiter pair. The body
 * extends until a blank line or the start of another block (`interrupts`); a
 * plain paragraph-like line inside that range is a lazy single-cell row, per
 * the GFM spec ("the table is broken at the first empty line or beginning of
 * another block-level structural element").
 */
export function matchTable(
	lines: readonly string[],
	start: number,
	interrupts?: (line: string) => boolean,
): TableData | null {
	const headerLine: string = lines[start] ?? '';
	const delimLine: string = lines[start + 1] ?? '';
	if (!headerLine.includes('|')) return null;
	if (!DELIMITER_ROW.test(delimLine)) return null;

	const header: string[] = splitRow(headerLine);
	const aligns: ColumnAlign[] = splitRow(delimLine).map(cellAlign);
	if (aligns.length !== header.length) return null;

	const rows: string[][] = [];
	let i: number = start + 2;
	while (i < lines.length) {
		const line: string = lines[i] ?? '';
		if (line.trim() === '') break;
		if (!line.includes('|') && (!interrupts || interrupts(line))) break;
		rows.push(splitRow(line));
		i++;
	}

	return { aligns, header, rows, linesConsumed: i - start };
}
