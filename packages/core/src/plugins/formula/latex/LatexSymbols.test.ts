import { describe, expect, it } from 'vitest';
import { SymbolKind, lookupSymbol, resolveDelimiter } from './LatexSymbols.js';
import { latexToMathML } from './LatexToMathML.js';

function render(latex: string): string {
	return latexToMathML(latex).presentation;
}

describe('greek letters', () => {
	it('renders lowercase greek as identifiers', () => {
		expect(render('\\alpha')).toBe('<mi>α</mi>');
		expect(render('\\beta')).toBe('<mi>β</mi>');
		expect(render('\\pi')).toBe('<mi>π</mi>');
		expect(render('\\omega')).toBe('<mi>ω</mi>');
	});

	it('renders uppercase greek as identifiers', () => {
		expect(render('\\Gamma')).toBe('<mi>Γ</mi>');
		expect(render('\\Sigma')).toBe('<mi>Σ</mi>');
		expect(render('\\Omega')).toBe('<mi>Ω</mi>');
	});

	it('renders greek variants', () => {
		expect(render('\\varepsilon')).toBe('<mi>ε</mi>');
		expect(render('\\varphi')).toBe('<mi>φ</mi>');
	});
});

describe('binary operators', () => {
	it('renders as operators', () => {
		expect(render('\\times')).toBe('<mo>×</mo>');
		expect(render('\\div')).toBe('<mo>÷</mo>');
		expect(render('\\pm')).toBe('<mo>±</mo>');
		expect(render('\\cdot')).toBe('<mo>⋅</mo>');
		expect(render('\\oplus')).toBe('<mo>⊕</mo>');
		expect(render('\\cap')).toBe('<mo>∩</mo>');
	});
});

describe('relations', () => {
	it('renders as operators', () => {
		expect(render('\\leq')).toBe('<mo>≤</mo>');
		expect(render('\\geq')).toBe('<mo>≥</mo>');
		expect(render('\\neq')).toBe('<mo>≠</mo>');
		expect(render('\\approx')).toBe('<mo>≈</mo>');
		expect(render('\\in')).toBe('<mo>∈</mo>');
		expect(render('\\subseteq')).toBe('<mo>⊆</mo>');
		expect(render('\\equiv')).toBe('<mo>≡</mo>');
	});

	it('treats \\le and \\leq as the same glyph', () => {
		expect(render('\\le')).toBe(render('\\leq'));
	});
});

describe('arrows', () => {
	it('renders as operators', () => {
		expect(render('\\rightarrow')).toBe('<mo>→</mo>');
		expect(render('\\leftarrow')).toBe('<mo>←</mo>');
		expect(render('\\Rightarrow')).toBe('<mo>⇒</mo>');
		expect(render('\\leftrightarrow')).toBe('<mo>↔</mo>');
		expect(render('\\mapsto')).toBe('<mo>↦</mo>');
	});

	it('aliases \\to and \\gets', () => {
		expect(render('\\to')).toBe('<mo>→</mo>');
		expect(render('\\gets')).toBe('<mo>←</mo>');
	});
});

describe('misc symbols', () => {
	it('renders ordinary symbols as identifiers', () => {
		expect(render('\\infty')).toBe('<mi>∞</mi>');
		expect(render('\\partial')).toBe('<mi>∂</mi>');
		expect(render('\\nabla')).toBe('<mi>∇</mi>');
		expect(render('\\forall')).toBe('<mi>∀</mi>');
		expect(render('\\emptyset')).toBe('<mi>∅</mi>');
		expect(render('\\aleph')).toBe('<mi>ℵ</mi>');
	});

	it('renders ellipses', () => {
		expect(render('\\cdots')).toBe('<mi>⋯</mi>');
		expect(render('\\ldots')).toBe('<mi>…</mi>');
	});
});

describe('delimiters', () => {
	it('renders bracket delimiters as fences', () => {
		expect(render('\\langle')).toBe('<mo fence="true">⟨</mo>');
		expect(render('\\rangle')).toBe('<mo fence="true">⟩</mo>');
		expect(render('\\lceil')).toBe('<mo fence="true">⌈</mo>');
		expect(render('\\lfloor')).toBe('<mo fence="true">⌊</mo>');
	});

	it('renders bare parentheses and brackets as fences', () => {
		expect(render('(')).toBe('<mo fence="true">(</mo>');
		expect(render(']')).toBe('<mo fence="true">]</mo>');
	});
});

describe('named functions', () => {
	it('renders trig and log functions upright', () => {
		expect(render('\\cos')).toBe('<mi mathvariant="normal">cos</mi>');
		expect(render('\\tan')).toBe('<mi mathvariant="normal">tan</mi>');
		expect(render('\\ln')).toBe('<mi mathvariant="normal">ln</mi>');
		expect(render('\\exp')).toBe('<mi mathvariant="normal">exp</mi>');
	});
});

describe('lookupSymbol', () => {
	it('returns kinds for known commands', () => {
		expect(lookupSymbol('alpha')?.kind).toBe(SymbolKind.Ordinary);
		expect(lookupSymbol('times')?.kind).toBe(SymbolKind.Binary);
		expect(lookupSymbol('leq')?.kind).toBe(SymbolKind.Relation);
		expect(lookupSymbol('rightarrow')?.kind).toBe(SymbolKind.Arrow);
		expect(lookupSymbol('sum')?.kind).toBe(SymbolKind.BigOp);
		expect(lookupSymbol('sin')?.kind).toBe(SymbolKind.Function);
		expect(lookupSymbol('langle')?.kind).toBe(SymbolKind.Open);
	});

	it('returns undefined for unknown commands', () => {
		expect(lookupSymbol('definitelynotacommand')).toBeUndefined();
	});
});

describe('resolveDelimiter', () => {
	it('resolves literal characters', () => {
		expect(resolveDelimiter('(')?.char).toBe('(');
		expect(resolveDelimiter(']')?.char).toBe(']');
	});

	it('resolves the null delimiter to an empty glyph', () => {
		expect(resolveDelimiter('.')?.char).toBe('');
	});

	it('resolves command delimiters', () => {
		expect(resolveDelimiter('\\langle')?.char).toBe('⟨');
		expect(resolveDelimiter('\\{')?.char).toBe('{');
		expect(resolveDelimiter('\\|')?.char).toBe('‖');
	});
});
