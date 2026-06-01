/**
 * Default structural palette / on-screen math keyboard data (Layer A).
 *
 * Each item inserts a LaTeX snippet; `$0` marks where the caret lands so the
 * user can keep typing inside the new structure. Group labels are supplied by
 * the host (translatable); item labels are the universal symbols themselves and
 * carry an English accessible name.
 */

import type { MathPaletteGroup } from './MathFieldTypes.js';

/** Translatable group labels for the default palette. */
export interface MathPaletteLabels {
	readonly fractions: string;
	readonly scripts: string;
	readonly roots: string;
	readonly operators: string;
	readonly greek: string;
	readonly relations: string;
	readonly matrices: string;
	readonly arrows: string;
}

/** Builds the default palette groups using the given (translatable) group labels. */
export function buildMathPalette(labels: MathPaletteLabels): MathPaletteGroup[] {
	return [
		{
			id: 'fractions',
			label: labels.fractions,
			items: [
				{ label: 'a╱b', ariaLabel: 'Fraction', snippet: '\\frac{$0}{}' },
				{ label: '⒞', ariaLabel: 'Binomial coefficient', snippet: '\\binom{$0}{}' },
			],
		},
		{
			id: 'scripts',
			label: labels.scripts,
			items: [
				{ label: 'xⁿ', ariaLabel: 'Superscript', snippet: '^{$0}' },
				{ label: 'xₙ', ariaLabel: 'Subscript', snippet: '_{$0}' },
				{ label: 'xⁿₘ', ariaLabel: 'Subscript and superscript', snippet: '_{$0}^{}' },
			],
		},
		{
			id: 'roots',
			label: labels.roots,
			items: [
				{ label: '√', ariaLabel: 'Square root', snippet: '\\sqrt{$0}' },
				{ label: 'ⁿ√', ariaLabel: 'N-th root', snippet: '\\sqrt[$0]{}' },
			],
		},
		{
			id: 'operators',
			label: labels.operators,
			items: [
				{ label: '∑', ariaLabel: 'Sum with limits', snippet: '\\sum_{$0}^{}' },
				{ label: '∏', ariaLabel: 'Product with limits', snippet: '\\prod_{$0}^{}' },
				{ label: '∫', ariaLabel: 'Integral with limits', snippet: '\\int_{$0}^{}' },
				{ label: 'lim', ariaLabel: 'Limit', snippet: '\\lim_{$0}' },
				{ label: '×', ariaLabel: 'Times', snippet: '\\times ' },
				{ label: '·', ariaLabel: 'Dot product', snippet: '\\cdot ' },
				{ label: '±', ariaLabel: 'Plus or minus', snippet: '\\pm ' },
				{ label: '÷', ariaLabel: 'Division', snippet: '\\div ' },
				{ label: '∞', ariaLabel: 'Infinity', snippet: '\\infty ' },
			],
		},
		{
			id: 'greek',
			label: labels.greek,
			items: [
				{ label: 'α', ariaLabel: 'Alpha', snippet: '\\alpha ' },
				{ label: 'β', ariaLabel: 'Beta', snippet: '\\beta ' },
				{ label: 'γ', ariaLabel: 'Gamma', snippet: '\\gamma ' },
				{ label: 'δ', ariaLabel: 'Delta', snippet: '\\delta ' },
				{ label: 'θ', ariaLabel: 'Theta', snippet: '\\theta ' },
				{ label: 'λ', ariaLabel: 'Lambda', snippet: '\\lambda ' },
				{ label: 'μ', ariaLabel: 'Mu', snippet: '\\mu ' },
				{ label: 'π', ariaLabel: 'Pi', snippet: '\\pi ' },
				{ label: 'σ', ariaLabel: 'Sigma', snippet: '\\sigma ' },
				{ label: 'φ', ariaLabel: 'Phi', snippet: '\\phi ' },
				{ label: 'ω', ariaLabel: 'Omega', snippet: '\\omega ' },
				{ label: 'Δ', ariaLabel: 'Capital delta', snippet: '\\Delta ' },
				{ label: 'Σ', ariaLabel: 'Capital sigma', snippet: '\\Sigma ' },
				{ label: 'Ω', ariaLabel: 'Capital omega', snippet: '\\Omega ' },
			],
		},
		{
			id: 'relations',
			label: labels.relations,
			items: [
				{ label: '≤', ariaLabel: 'Less than or equal to', snippet: '\\leq ' },
				{ label: '≥', ariaLabel: 'Greater than or equal to', snippet: '\\geq ' },
				{ label: '≠', ariaLabel: 'Not equal to', snippet: '\\neq ' },
				{ label: '≈', ariaLabel: 'Approximately equal to', snippet: '\\approx ' },
				{ label: '≡', ariaLabel: 'Equivalent to', snippet: '\\equiv ' },
				{ label: '∈', ariaLabel: 'Element of', snippet: '\\in ' },
				{ label: '⊆', ariaLabel: 'Subset of or equal to', snippet: '\\subseteq ' },
			],
		},
		{
			id: 'arrows',
			label: labels.arrows,
			items: [
				{ label: '→', ariaLabel: 'Right arrow', snippet: '\\to ' },
				{ label: '⇒', ariaLabel: 'Implies', snippet: '\\Rightarrow ' },
				{ label: '↔', ariaLabel: 'If and only if', snippet: '\\leftrightarrow ' },
				{ label: '↦', ariaLabel: 'Maps to', snippet: '\\mapsto ' },
			],
		},
		{
			id: 'matrices',
			label: labels.matrices,
			items: [
				{
					label: '[ ]',
					ariaLabel: 'Bracket matrix',
					snippet: '\\begin{bmatrix} $0 & \\\\ & \\end{bmatrix}',
				},
				{
					label: '( )',
					ariaLabel: 'Parenthesis matrix',
					snippet: '\\begin{pmatrix} $0 & \\\\ & \\end{pmatrix}',
				},
				{
					label: '{',
					ariaLabel: 'Cases',
					snippet: '\\begin{cases} $0 & \\\\ & \\end{cases}',
				},
			],
		},
	];
}
