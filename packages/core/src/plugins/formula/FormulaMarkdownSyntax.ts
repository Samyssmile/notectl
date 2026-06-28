/**
 * Markdown grammar extension for the formula plugin.
 *
 * Contributes `$...$` (inline) and `$$...$$` (display) to the core Markdown
 * engine via `registerMarkdownSyntax`, so the engine never hard-codes math
 * syntax (D4). The engine threads these matchers in through the parser's
 * `syntaxExtensions` option.
 */

import type { MarkdownSyntaxExtension } from '../../model/MarkdownSyntaxRegistry.js';
import { DISPLAY_MATH_TYPE, type FormulaAttrs, INLINE_MATH_TYPE } from './FormulaTypes.js';
import { latexToMathML } from './latex/index.js';
import { buildMathML } from './mathml/index.js';

const SINGLE_LINE_DISPLAY = /^\s*\$\$([^\n]+?)\$\$\s*$/;

/** Builds the node attributes for a formula from its LaTeX source. */
function formulaAttrs(latex: string, display: boolean): FormulaAttrs {
	const { presentation } = latexToMathML(latex, { display });
	const mathml: string = buildMathML({ presentation, latex, display });
	return { mathml, latex, alt: '', fontSize: '' };
}

/** Finds the matching closing `$` for an inline run, or -1 (no newline allowed). */
function findInlineClose(text: string, from: number): number {
	for (let i = from; i < text.length; i++) {
		const ch: string = text[i] ?? '';
		if (ch === '\n') return -1;
		if (ch === '$') return i;
	}
	return -1;
}

/** Creates the formula Markdown syntax extension (`$...$`, `$$...$$`). */
export function createFormulaMarkdownSyntax(): MarkdownSyntaxExtension {
	return {
		id: 'formula',
		matchInline(text, index) {
			if (text[index] !== '$' || text[index + 1] === '$') return null;
			const close: number = findInlineClose(text, index + 1);
			if (close === -1) return null;
			const latex: string = text.slice(index + 1, close).trim();
			if (latex === '') return null;
			return {
				type: INLINE_MATH_TYPE,
				attrs: { ...formulaAttrs(latex, false) },
				length: close - index + 1,
			};
		},
		matchBlock(lines, lineIndex) {
			const line: string = lines[lineIndex] ?? '';

			const single: RegExpMatchArray | null = line.match(SINGLE_LINE_DISPLAY);
			if (single?.[1]?.trim()) {
				return {
					type: DISPLAY_MATH_TYPE,
					attrs: { ...formulaAttrs(single[1].trim(), true) },
					linesConsumed: 1,
				};
			}

			if (line.trim() !== '$$') return null;
			const body: string[] = [];
			let i: number = lineIndex + 1;
			while (i < lines.length && (lines[i] ?? '').trim() !== '$$') {
				body.push(lines[i] ?? '');
				i++;
			}
			if (i >= lines.length) return null; // no closing fence
			const latex: string = body.join('\n').trim();
			return {
				type: DISPLAY_MATH_TYPE,
				attrs: { ...formulaAttrs(latex, true) },
				linesConsumed: i - lineIndex + 1,
			};
		},
	};
}
