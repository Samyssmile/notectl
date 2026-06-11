import { describe, expect, it } from 'vitest';
import { latexToMathML } from '../latex/index.js';
import type { LatexConversionResult } from '../latex/index.js';
import type { MathPaletteGroup, MathPaletteItem } from './MathFieldTypes.js';
import { type MathPaletteLabels, buildMathPalette } from './MathPaletteData.js';

/** Distinct, non-empty placeholder labels so we can spot a forgotten wiring. */
const LABELS: MathPaletteLabels = {
	fractions: 'fractions',
	scripts: 'scripts',
	roots: 'roots',
	accents: 'accents',
	operators: 'operators',
	functions: 'functions',
	greek: 'greek',
	relations: 'relations',
	sets: 'sets',
	logic: 'logic',
	arrows: 'arrows',
	delimiters: 'delimiters',
	dots: 'dots',
	matrices: 'matrices',
};

const GROUPS: readonly MathPaletteGroup[] = buildMathPalette(LABELS);
const ITEMS: readonly MathPaletteItem[] = GROUPS.flatMap((g) => g.items);

/** Strips the `$0` caret marker so the snippet is valid LaTeX to convert. */
function toLatex(snippet: string): string {
	return snippet.replace('$0', '');
}

describe('buildMathPalette', () => {
	it('applies the supplied group label to every group', () => {
		for (const group of GROUPS) {
			expect(group.label, group.id).toBe(LABELS[group.id as keyof MathPaletteLabels]);
		}
	});

	it('uses unique group ids', () => {
		const ids: string[] = GROUPS.map((g) => g.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('gives every item a non-empty label, aria-label and snippet', () => {
		for (const item of ITEMS) {
			expect(item.label.length, item.ariaLabel).toBeGreaterThan(0);
			expect(item.ariaLabel.length, item.label).toBeGreaterThan(0);
			expect(item.snippet.length, item.ariaLabel).toBeGreaterThan(0);
		}
	});

	it('gives every button a unique accessible name', () => {
		// Two controls that read the same to a screen reader but insert different
		// LaTeX are ambiguous (WCAG 2.4.6 / 4.1.2); each aria-label must be unique.
		const names: string[] = ITEMS.map((i) => i.ariaLabel);
		const duplicates: string[] = names.filter((n, i) => names.indexOf(n) !== i);
		expect(duplicates).toEqual([]);
	});

	it('contains at most one caret marker per snippet', () => {
		for (const item of ITEMS) {
			const markers: number = item.snippet.split('$0').length - 1;
			expect(markers, item.ariaLabel).toBeLessThanOrEqual(1);
		}
	});

	// The palette must only offer snippets the bundled converter understands;
	// a snippet that fails to parse would render an error marker to the user.
	it.each(ITEMS.map((i) => [i.ariaLabel, i.snippet] as const))(
		'converts the %s snippet without LaTeX errors',
		(_aria: string, snippet: string) => {
			const result: LatexConversionResult = latexToMathML(toLatex(snippet));
			expect(result.errors).toEqual([]);
			expect(result.presentation).toContain('<m');
		},
	);
});
