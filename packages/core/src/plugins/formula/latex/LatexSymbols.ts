/**
 * LaTeX symbol and command lookup tables for the zero-dependency converter.
 *
 * Layer A (framework-agnostic, zero notectl imports). Maps each supported LaTeX
 * command to the real Unicode character it produces plus a `kind` that drives
 * the choice of MathML element (`mi` vs `mo`, stretchy fences, big-operator
 * limit placement, upright function names).
 *
 * Supported commands by category (curated subset):
 *
 * - Greek letters (lowercase): \alpha \beta \gamma \delta \epsilon \varepsilon
 *   \zeta \eta \theta \vartheta \iota \kappa \lambda \mu \nu \xi \pi \varpi \rho
 *   \varrho \sigma \varsigma \tau \upsilon \phi \varphi \chi \psi \omega
 * - Greek letters (uppercase): \Gamma \Delta \Theta \Lambda \Xi \Pi \Sigma
 *   \Upsilon \Phi \Psi \Omega
 * - Named functions (upright mi): \sin \cos \tan \cot \sec \csc \sinh \cosh
 *   \tanh \coth \arcsin \arccos \arctan \log \ln \lg \exp \deg \det \dim \hom
 *   \ker \arg \Pr
 * - Big operators with limits: \sum \prod \coprod \int \iint \iiint \oint
 *   \bigcup \bigcap \bigsqcup \bigvee \bigwedge \bigoplus \bigotimes \bigodot
 *   \biguplus \lim \limsup \liminf \max \min \sup \inf \gcd \injlim \projlim
 * - Binary operators: \times \div \pm \mp \cdot \ast \star \circ \bullet \oplus
 *   \ominus \otimes \oslash \odot \cap \cup \uplus \sqcap \sqcup \wedge \vee
 *   \setminus \wr \diamond \bigtriangleup \bigtriangledown \triangleleft
 *   \triangleright \amalg \dagger \ddagger \cdot
 * - Relations: \leq \le \geq \ge \neq \ne \equiv \sim \simeq \cong \approx
 *   \propto \prec \succ \preceq \succeq \ll \gg \subset \supset \subseteq
 *   \supseteq \sqsubseteq \sqsupseteq \in \ni \notin \mid \parallel \perp
 *   \models \vdash \dashv \doteq \asymp \bowtie \smile \frown \lll \ggg \ne
 *   \subsetneq \supsetneq
 * - Arrows: \leftarrow \rightarrow \to \gets \leftrightarrow \Leftarrow
 *   \Rightarrow \Leftrightarrow \mapsto \longrightarrow \longleftarrow
 *   \longleftrightarrow \Longrightarrow \Longleftarrow \Longleftrightarrow
 *   \uparrow \downarrow \updownarrow \nearrow \searrow \swarrow \nwarrow
 *   \hookleftarrow \hookrightarrow \rightharpoonup \rightharpoondown
 *   \leftharpoonup \leftharpoondown \implies \iff \nleftarrow \nrightarrow
 * - Delimiters (used bare and by \left/\right): ( ) [ ] \{ \} \langle \rangle
 *   \lceil \rceil \lfloor \rfloor \lvert \rvert \lVert \rVert \vert \Vert
 *   \lbrace \rbrace \lbrack \rbrack \| \backslash
 * - Misc ordinary symbols: \infty \partial \nabla \forall \exists \nexists
 *   \emptyset \varnothing \aleph \hbar \ell \Re \Im \wp \prime \angle \triangle
 *   \neg \lnot \top \bot \flat \natural \sharp \clubsuit \diamondsuit
 *   \heartsuit \spadesuit \surd \cdots \ldots \vdots \ddots \dots \dotsb
 *   \square \blacksquare \bigstar \complement \degree \checkmark
 * - Punctuation operators: \colon \cdotp \ldotp
 *
 * Accents, fonts/styles, spacing, fractions, roots, big-op limit logic, and
 * environments are handled in the parser, not these tables.
 */

/** How a symbol maps onto MathML markup. */
export enum SymbolKind {
	/** Ordinary atom: rendered as `<mi>` (variable-like). */
	Ordinary = 'ordinary',
	/** Binary operator: `<mo>` (e.g. + × ∪). */
	Binary = 'binary',
	/** Relation: `<mo>` (e.g. = ≤ ∈). */
	Relation = 'relation',
	/** Arrow: `<mo>`, treated like a relation for spacing. */
	Arrow = 'arrow',
	/** Opening fence: `<mo fence="true">`. */
	Open = 'open',
	/** Closing fence: `<mo fence="true">`. */
	Close = 'close',
	/** Named function (e.g. sin, log): upright multi-letter `<mi>`. */
	Function = 'function',
	/** Big operator with limits (e.g. ∑ ∫ lim): `<mo>` with movable limits. */
	BigOp = 'bigop',
	/** Punctuation: `<mo>` (e.g. comma-like separators). */
	Punct = 'punct',
}

/** A resolved symbol: the Unicode glyph plus how to render it. */
export interface SymbolEntry {
	/** The literal Unicode character(s); never pre-escaped (the builder escapes). */
	readonly char: string;
	/** How the symbol maps onto a MathML element. */
	readonly kind: SymbolKind;
}

function entry(char: string, kind: SymbolKind): SymbolEntry {
	return { char, kind };
}

const O = SymbolKind.Ordinary;
const B = SymbolKind.Binary;
const R = SymbolKind.Relation;
const A = SymbolKind.Arrow;
const FN = SymbolKind.Function;
const BIG = SymbolKind.BigOp;
const P = SymbolKind.Punct;

const GREEK: Readonly<Record<string, SymbolEntry>> = {
	alpha: entry('α', O),
	beta: entry('β', O),
	gamma: entry('γ', O),
	delta: entry('δ', O),
	epsilon: entry('ϵ', O),
	varepsilon: entry('ε', O),
	zeta: entry('ζ', O),
	eta: entry('η', O),
	theta: entry('θ', O),
	vartheta: entry('ϑ', O),
	iota: entry('ι', O),
	kappa: entry('κ', O),
	lambda: entry('λ', O),
	mu: entry('μ', O),
	nu: entry('ν', O),
	xi: entry('ξ', O),
	omicron: entry('ο', O),
	pi: entry('π', O),
	varpi: entry('ϖ', O),
	rho: entry('ρ', O),
	varrho: entry('ϱ', O),
	sigma: entry('σ', O),
	varsigma: entry('ς', O),
	tau: entry('τ', O),
	upsilon: entry('υ', O),
	phi: entry('ϕ', O),
	varphi: entry('φ', O),
	chi: entry('χ', O),
	psi: entry('ψ', O),
	omega: entry('ω', O),
	Gamma: entry('Γ', O),
	Delta: entry('Δ', O),
	Theta: entry('Θ', O),
	Lambda: entry('Λ', O),
	Xi: entry('Ξ', O),
	Pi: entry('Π', O),
	Sigma: entry('Σ', O),
	Upsilon: entry('Υ', O),
	Phi: entry('Φ', O),
	Psi: entry('Ψ', O),
	Omega: entry('Ω', O),
};

const FUNCTIONS: Readonly<Record<string, SymbolEntry>> = {
	sin: entry('sin', FN),
	cos: entry('cos', FN),
	tan: entry('tan', FN),
	cot: entry('cot', FN),
	sec: entry('sec', FN),
	csc: entry('csc', FN),
	sinh: entry('sinh', FN),
	cosh: entry('cosh', FN),
	tanh: entry('tanh', FN),
	coth: entry('coth', FN),
	arcsin: entry('arcsin', FN),
	arccos: entry('arccos', FN),
	arctan: entry('arctan', FN),
	log: entry('log', FN),
	ln: entry('ln', FN),
	lg: entry('lg', FN),
	exp: entry('exp', FN),
	deg: entry('deg', FN),
	det: entry('det', FN),
	dim: entry('dim', FN),
	hom: entry('hom', FN),
	ker: entry('ker', FN),
	arg: entry('arg', FN),
	Pr: entry('Pr', FN),
};

const BIG_OPS: Readonly<Record<string, SymbolEntry>> = {
	sum: entry('∑', BIG),
	prod: entry('∏', BIG),
	coprod: entry('∐', BIG),
	int: entry('∫', BIG),
	iint: entry('∬', BIG),
	iiint: entry('∭', BIG),
	oint: entry('∮', BIG),
	bigcup: entry('⋃', BIG),
	bigcap: entry('⋂', BIG),
	bigsqcup: entry('⨆', BIG),
	bigvee: entry('⋁', BIG),
	bigwedge: entry('⋀', BIG),
	bigoplus: entry('⨁', BIG),
	bigotimes: entry('⨂', BIG),
	bigodot: entry('⨀', BIG),
	biguplus: entry('⨄', BIG),
	lim: entry('lim', BIG),
	limsup: entry('lim sup', BIG),
	liminf: entry('lim inf', BIG),
	injlim: entry('inj lim', BIG),
	projlim: entry('proj lim', BIG),
	max: entry('max', BIG),
	min: entry('min', BIG),
	sup: entry('sup', BIG),
	inf: entry('inf', BIG),
	gcd: entry('gcd', BIG),
};

const BINARY_OPS: Readonly<Record<string, SymbolEntry>> = {
	times: entry('×', B),
	div: entry('÷', B),
	pm: entry('±', B),
	mp: entry('∓', B),
	cdot: entry('⋅', B),
	ast: entry('∗', B),
	star: entry('⋆', B),
	circ: entry('∘', B),
	bullet: entry('∙', B),
	oplus: entry('⊕', B),
	ominus: entry('⊖', B),
	otimes: entry('⊗', B),
	oslash: entry('⊘', B),
	odot: entry('⊙', B),
	cap: entry('∩', B),
	cup: entry('∪', B),
	uplus: entry('⊎', B),
	sqcap: entry('⊓', B),
	sqcup: entry('⊔', B),
	wedge: entry('∧', B),
	land: entry('∧', B),
	vee: entry('∨', B),
	lor: entry('∨', B),
	setminus: entry('∖', B),
	wr: entry('≀', B),
	diamond: entry('⋄', B),
	bigtriangleup: entry('△', B),
	bigtriangledown: entry('▽', B),
	triangleleft: entry('◁', B),
	triangleright: entry('▷', B),
	amalg: entry('⨿', B),
	dagger: entry('†', B),
	ddagger: entry('‡', B),
};

const RELATIONS: Readonly<Record<string, SymbolEntry>> = {
	leq: entry('≤', R),
	le: entry('≤', R),
	geq: entry('≥', R),
	ge: entry('≥', R),
	neq: entry('≠', R),
	ne: entry('≠', R),
	equiv: entry('≡', R),
	sim: entry('∼', R),
	simeq: entry('≃', R),
	cong: entry('≅', R),
	approx: entry('≈', R),
	propto: entry('∝', R),
	prec: entry('≺', R),
	succ: entry('≻', R),
	preceq: entry('⪯', R),
	succeq: entry('⪰', R),
	ll: entry('≪', R),
	gg: entry('≫', R),
	lll: entry('⋘', R),
	ggg: entry('⋙', R),
	subset: entry('⊂', R),
	supset: entry('⊃', R),
	subseteq: entry('⊆', R),
	supseteq: entry('⊇', R),
	subsetneq: entry('⊊', R),
	supsetneq: entry('⊋', R),
	sqsubseteq: entry('⊑', R),
	sqsupseteq: entry('⊒', R),
	in: entry('∈', R),
	ni: entry('∋', R),
	notin: entry('∉', R),
	mid: entry('∣', R),
	parallel: entry('∥', R),
	perp: entry('⊥', R),
	models: entry('⊨', R),
	vdash: entry('⊢', R),
	dashv: entry('⊣', R),
	doteq: entry('≐', R),
	asymp: entry('≍', R),
	bowtie: entry('⋈', R),
	smile: entry('⌣', R),
	frown: entry('⌢', R),
};

const ARROWS: Readonly<Record<string, SymbolEntry>> = {
	leftarrow: entry('←', A),
	gets: entry('←', A),
	rightarrow: entry('→', A),
	to: entry('→', A),
	leftrightarrow: entry('↔', A),
	Leftarrow: entry('⇐', A),
	Rightarrow: entry('⇒', A),
	Leftrightarrow: entry('⇔', A),
	mapsto: entry('↦', A),
	longrightarrow: entry('⟶', A),
	longleftarrow: entry('⟵', A),
	longleftrightarrow: entry('⟷', A),
	Longrightarrow: entry('⟹', A),
	Longleftarrow: entry('⟸', A),
	Longleftrightarrow: entry('⟺', A),
	implies: entry('⟹', A),
	iff: entry('⟺', A),
	uparrow: entry('↑', A),
	downarrow: entry('↓', A),
	updownarrow: entry('↕', A),
	nearrow: entry('↗', A),
	searrow: entry('↘', A),
	swarrow: entry('↙', A),
	nwarrow: entry('↖', A),
	hookleftarrow: entry('↩', A),
	hookrightarrow: entry('↪', A),
	rightharpoonup: entry('⇀', A),
	rightharpoondown: entry('⇁', A),
	leftharpoonup: entry('↼', A),
	leftharpoondown: entry('↽', A),
	nleftarrow: entry('↚', A),
	nrightarrow: entry('↛', A),
};

const DELIMITERS: Readonly<Record<string, SymbolEntry>> = {
	langle: entry('⟨', SymbolKind.Open),
	rangle: entry('⟩', SymbolKind.Close),
	lceil: entry('⌈', SymbolKind.Open),
	rceil: entry('⌉', SymbolKind.Close),
	lfloor: entry('⌊', SymbolKind.Open),
	rfloor: entry('⌋', SymbolKind.Close),
	lbrace: entry('{', SymbolKind.Open),
	rbrace: entry('}', SymbolKind.Close),
	lbrack: entry('[', SymbolKind.Open),
	rbrack: entry(']', SymbolKind.Close),
	lvert: entry('|', SymbolKind.Open),
	rvert: entry('|', SymbolKind.Close),
	lVert: entry('‖', SymbolKind.Open),
	rVert: entry('‖', SymbolKind.Close),
	vert: entry('|', SymbolKind.Relation),
	Vert: entry('‖', SymbolKind.Relation),
	backslash: entry('\\', O),
};

const MISC: Readonly<Record<string, SymbolEntry>> = {
	infty: entry('∞', O),
	partial: entry('∂', O),
	nabla: entry('∇', O),
	forall: entry('∀', O),
	exists: entry('∃', O),
	nexists: entry('∄', O),
	emptyset: entry('∅', O),
	varnothing: entry('∅', O),
	aleph: entry('ℵ', O),
	beth: entry('ℶ', O),
	hbar: entry('ℏ', O),
	ell: entry('ℓ', O),
	Re: entry('ℜ', O),
	Im: entry('ℑ', O),
	wp: entry('℘', O),
	prime: entry('′', O),
	angle: entry('∠', O),
	measuredangle: entry('∡', O),
	triangle: entry('△', O),
	neg: entry('¬', O),
	lnot: entry('¬', O),
	top: entry('⊤', O),
	bot: entry('⊥', O),
	flat: entry('♭', O),
	natural: entry('♮', O),
	sharp: entry('♯', O),
	clubsuit: entry('♣', O),
	diamondsuit: entry('♢', O),
	heartsuit: entry('♡', O),
	spadesuit: entry('♠', O),
	surd: entry('√', O),
	complement: entry('∁', O),
	square: entry('□', O),
	blacksquare: entry('■', O),
	bigstar: entry('★', O),
	checkmark: entry('✓', O),
	degree: entry('°', O),
	cdots: entry('⋯', O),
	ldots: entry('…', O),
	dots: entry('…', O),
	dotsb: entry('⋯', O),
	vdots: entry('⋮', O),
	ddots: entry('⋱', O),
};

const PUNCT: Readonly<Record<string, SymbolEntry>> = {
	colon: entry(':', P),
	cdotp: entry('·', P),
	ldotp: entry('.', P),
};

/** All symbol commands merged into a single lookup table. */
export const SYMBOLS: Readonly<Record<string, SymbolEntry>> = {
	...GREEK,
	...FUNCTIONS,
	...BIG_OPS,
	...BINARY_OPS,
	...RELATIONS,
	...ARROWS,
	...DELIMITERS,
	...MISC,
	...PUNCT,
};

/** Returns the symbol entry for a command name (without the leading backslash). */
export function lookupSymbol(name: string): SymbolEntry | undefined {
	return SYMBOLS[name];
}

/** Maps a single literal delimiter character to its fence kind, if it is one. */
const DELIMITER_CHARS: Readonly<Record<string, SymbolEntry>> = {
	'(': entry('(', SymbolKind.Open),
	')': entry(')', SymbolKind.Close),
	'[': entry('[', SymbolKind.Open),
	']': entry(']', SymbolKind.Close),
	'|': entry('|', SymbolKind.Relation),
	'/': entry('/', O),
};

/**
 * Resolves a delimiter spec (as used after `\left`/`\right`) to its glyph.
 * Accepts literal chars, the `.` null delimiter, and delimiter commands.
 */
export function resolveDelimiter(spec: string): SymbolEntry | undefined {
	if (spec === '.') return entry('', O);
	if (spec.startsWith('\\')) {
		const name: string = spec.slice(1);
		if (name === '{') return entry('{', SymbolKind.Open);
		if (name === '}') return entry('}', SymbolKind.Close);
		if (name === '|') return entry('‖', SymbolKind.Relation);
		if (name === '\\') return entry('\\', O);
		return DELIMITERS[name];
	}
	return DELIMITER_CHARS[spec];
}
