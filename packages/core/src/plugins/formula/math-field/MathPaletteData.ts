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
	readonly accents: string;
	readonly operators: string;
	readonly functions: string;
	readonly greek: string;
	readonly relations: string;
	readonly sets: string;
	readonly logic: string;
	readonly arrows: string;
	readonly delimiters: string;
	readonly dots: string;
	readonly matrices: string;
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
			id: 'accents',
			label: labels.accents,
			items: [
				{ label: '→', ariaLabel: 'Vector', snippet: '\\vec{$0}' },
				{ label: 'â', ariaLabel: 'Hat', snippet: '\\hat{$0}' },
				{ label: 'ā', ariaLabel: 'Overline', snippet: '\\overline{$0}' },
				{ label: 'ȧ', ariaLabel: 'Dot above', snippet: '\\dot{$0}' },
				{ label: 'ã', ariaLabel: 'Tilde', snippet: '\\tilde{$0}' },
			],
		},
		{
			id: 'operators',
			label: labels.operators,
			items: [
				{ label: '∑', ariaLabel: 'Sum with limits', snippet: '\\sum_{$0}^{}' },
				{ label: '∏', ariaLabel: 'Product with limits', snippet: '\\prod_{$0}^{}' },
				{ label: '∫', ariaLabel: 'Integral with limits', snippet: '\\int_{$0}^{}' },
				{ label: '∬', ariaLabel: 'Double integral', snippet: '\\iint ' },
				{ label: '∮', ariaLabel: 'Contour integral', snippet: '\\oint ' },
				{ label: 'lim', ariaLabel: 'Limit', snippet: '\\lim_{$0}' },
				{ label: '∂', ariaLabel: 'Partial derivative', snippet: '\\partial ' },
				{ label: '∇', ariaLabel: 'Nabla (del)', snippet: '\\nabla ' },
				{ label: '×', ariaLabel: 'Times', snippet: '\\times ' },
				{ label: '·', ariaLabel: 'Dot product', snippet: '\\cdot ' },
				{ label: '±', ariaLabel: 'Plus or minus', snippet: '\\pm ' },
				{ label: '÷', ariaLabel: 'Division', snippet: '\\div ' },
				{ label: '∞', ariaLabel: 'Infinity', snippet: '\\infty ' },
			],
		},
		{
			id: 'functions',
			label: labels.functions,
			items: [
				{ label: 'sin', ariaLabel: 'Sine', snippet: '\\sin ' },
				{ label: 'cos', ariaLabel: 'Cosine', snippet: '\\cos ' },
				{ label: 'tan', ariaLabel: 'Tangent', snippet: '\\tan ' },
				{ label: 'log', ariaLabel: 'Logarithm', snippet: '\\log ' },
				{ label: 'ln', ariaLabel: 'Natural logarithm', snippet: '\\ln ' },
				{ label: 'exp', ariaLabel: 'Exponential function', snippet: '\\exp ' },
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
				{ label: 'ε', ariaLabel: 'Epsilon', snippet: '\\varepsilon ' },
				{ label: 'ζ', ariaLabel: 'Zeta', snippet: '\\zeta ' },
				{ label: 'η', ariaLabel: 'Eta', snippet: '\\eta ' },
				{ label: 'θ', ariaLabel: 'Theta', snippet: '\\theta ' },
				{ label: 'κ', ariaLabel: 'Kappa', snippet: '\\kappa ' },
				{ label: 'λ', ariaLabel: 'Lambda', snippet: '\\lambda ' },
				{ label: 'μ', ariaLabel: 'Mu', snippet: '\\mu ' },
				{ label: 'ν', ariaLabel: 'Nu', snippet: '\\nu ' },
				{ label: 'ξ', ariaLabel: 'Xi', snippet: '\\xi ' },
				{ label: 'π', ariaLabel: 'Pi', snippet: '\\pi ' },
				{ label: 'ρ', ariaLabel: 'Rho', snippet: '\\rho ' },
				{ label: 'σ', ariaLabel: 'Sigma', snippet: '\\sigma ' },
				{ label: 'τ', ariaLabel: 'Tau', snippet: '\\tau ' },
				{ label: 'φ', ariaLabel: 'Phi', snippet: '\\varphi ' },
				{ label: 'χ', ariaLabel: 'Chi', snippet: '\\chi ' },
				{ label: 'ψ', ariaLabel: 'Psi', snippet: '\\psi ' },
				{ label: 'ω', ariaLabel: 'Omega', snippet: '\\omega ' },
				{ label: 'Γ', ariaLabel: 'Capital gamma', snippet: '\\Gamma ' },
				{ label: 'Δ', ariaLabel: 'Capital delta', snippet: '\\Delta ' },
				{ label: 'Θ', ariaLabel: 'Capital theta', snippet: '\\Theta ' },
				{ label: 'Λ', ariaLabel: 'Capital lambda', snippet: '\\Lambda ' },
				{ label: 'Π', ariaLabel: 'Capital pi', snippet: '\\Pi ' },
				{ label: 'Σ', ariaLabel: 'Capital sigma', snippet: '\\Sigma ' },
				{ label: 'Φ', ariaLabel: 'Capital phi', snippet: '\\Phi ' },
				{ label: 'Ψ', ariaLabel: 'Capital psi', snippet: '\\Psi ' },
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
				{ label: '∼', ariaLabel: 'Similar to', snippet: '\\sim ' },
				{ label: '≅', ariaLabel: 'Congruent to', snippet: '\\cong ' },
				{ label: '∝', ariaLabel: 'Proportional to', snippet: '\\propto ' },
			],
		},
		{
			id: 'sets',
			label: labels.sets,
			items: [
				{ label: '∈', ariaLabel: 'Element of', snippet: '\\in ' },
				{ label: '∉', ariaLabel: 'Not an element of', snippet: '\\notin ' },
				{ label: '⊂', ariaLabel: 'Subset of', snippet: '\\subset ' },
				{ label: '⊆', ariaLabel: 'Subset of or equal to', snippet: '\\subseteq ' },
				{ label: '∪', ariaLabel: 'Union', snippet: '\\cup ' },
				{ label: '∩', ariaLabel: 'Intersection', snippet: '\\cap ' },
				{ label: '∅', ariaLabel: 'Empty set', snippet: '\\emptyset ' },
				{ label: 'ℝ', ariaLabel: 'Real numbers', snippet: '\\mathbb{R}' },
				{ label: 'ℕ', ariaLabel: 'Natural numbers', snippet: '\\mathbb{N}' },
				{ label: 'ℤ', ariaLabel: 'Integers', snippet: '\\mathbb{Z}' },
				{ label: 'ℚ', ariaLabel: 'Rational numbers', snippet: '\\mathbb{Q}' },
				{ label: 'ℂ', ariaLabel: 'Complex numbers', snippet: '\\mathbb{C}' },
			],
		},
		{
			id: 'logic',
			label: labels.logic,
			items: [
				{ label: '∀', ariaLabel: 'For all', snippet: '\\forall ' },
				{ label: '∃', ariaLabel: 'There exists', snippet: '\\exists ' },
				{ label: '¬', ariaLabel: 'Logical not', snippet: '\\neg ' },
				{ label: '∧', ariaLabel: 'Logical and', snippet: '\\land ' },
				{ label: '∨', ariaLabel: 'Logical or', snippet: '\\lor ' },
				{ label: '⟹', ariaLabel: 'Implies', snippet: '\\implies ' },
				{ label: '⟺', ariaLabel: 'If and only if', snippet: '\\iff ' },
			],
		},
		{
			id: 'arrows',
			label: labels.arrows,
			items: [
				{ label: '→', ariaLabel: 'Right arrow', snippet: '\\to ' },
				{ label: '⇒', ariaLabel: 'Rightwards double arrow', snippet: '\\Rightarrow ' },
				{ label: '↔', ariaLabel: 'Left-right arrow', snippet: '\\leftrightarrow ' },
				{ label: '↦', ariaLabel: 'Maps to', snippet: '\\mapsto ' },
			],
		},
		{
			id: 'delimiters',
			label: labels.delimiters,
			items: [
				{ label: '( )', ariaLabel: 'Auto-sized parentheses', snippet: '\\left($0\\right)' },
				{ label: '[ ]', ariaLabel: 'Auto-sized brackets', snippet: '\\left[$0\\right]' },
				{ label: '{ }', ariaLabel: 'Auto-sized braces', snippet: '\\left\\{$0\\right\\}' },
				{ label: '|x|', ariaLabel: 'Absolute value', snippet: '\\left|$0\\right|' },
				{ label: '‖x‖', ariaLabel: 'Norm', snippet: '\\left\\|$0\\right\\|' },
				{ label: '⌊x⌋', ariaLabel: 'Floor', snippet: '\\left\\lfloor $0\\right\\rfloor' },
				{ label: '⌈x⌉', ariaLabel: 'Ceiling', snippet: '\\left\\lceil $0\\right\\rceil' },
			],
		},
		{
			id: 'dots',
			label: labels.dots,
			items: [
				{ label: '⋯', ariaLabel: 'Centred ellipsis', snippet: '\\cdots ' },
				{ label: '…', ariaLabel: 'Baseline ellipsis', snippet: '\\ldots ' },
				{ label: '⋮', ariaLabel: 'Vertical ellipsis', snippet: '\\vdots ' },
				{ label: '⋱', ariaLabel: 'Diagonal ellipsis', snippet: '\\ddots ' },
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
