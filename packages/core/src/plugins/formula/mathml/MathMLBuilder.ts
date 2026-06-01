/**
 * String builders for Presentation MathML.
 *
 * Layer A (framework-agnostic, zero notectl imports). Produces MathML markup as
 * plain strings — DOM-free, so it is fully unit-testable under happy-dom and
 * matches the string storage format (D-3). The LaTeX converter composes these
 * helpers to emit a single presentation root element.
 */

export type MathMLAttrs = Readonly<Record<string, string | number | boolean>>;

const TEXT_ESCAPES: Readonly<Record<string, string>> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
};

const ATTR_ESCAPES: Readonly<Record<string, string>> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
};

/** Escapes a string for use as MathML element text content. */
export function escapeText(text: string): string {
	return text.replace(/[&<>]/g, (c) => TEXT_ESCAPES[c] ?? c);
}

/** Escapes a string for use inside a double-quoted attribute value. */
export function escapeAttr(value: string): string {
	return value.replace(/[&<>"]/g, (c) => ATTR_ESCAPES[c] ?? c);
}

function serializeAttrs(attrs?: MathMLAttrs): string {
	if (!attrs) return '';
	let out = '';
	for (const [key, value] of Object.entries(attrs)) {
		if (value === false || value === undefined || value === null) continue;
		if (value === true) {
			out += ` ${key}="true"`;
			continue;
		}
		out += ` ${key}="${escapeAttr(String(value))}"`;
	}
	return out;
}

/** Builds an arbitrary MathML element from a tag, raw-markup children, and attrs. */
export function element(tag: string, children: string, attrs?: MathMLAttrs): string {
	return `<${tag}${serializeAttrs(attrs)}>${children}</${tag}>`;
}

/** Builds a self-closing-style empty MathML element (e.g. `<mspace …></mspace>`). */
export function emptyElement(tag: string, attrs?: MathMLAttrs): string {
	return `<${tag}${serializeAttrs(attrs)}></${tag}>`;
}

/** Identifier (variable/function name). Text is escaped. */
export function mi(text: string, attrs?: MathMLAttrs): string {
	return element('mi', escapeText(text), attrs);
}

/** Number literal. Text is escaped. */
export function mn(text: string, attrs?: MathMLAttrs): string {
	return element('mn', escapeText(text), attrs);
}

/** Operator (incl. fences, big operators). Text is escaped. */
export function mo(op: string, attrs?: MathMLAttrs): string {
	return element('mo', escapeText(op), attrs);
}

/** Literal text run. Text is escaped. */
export function mtext(text: string, attrs?: MathMLAttrs): string {
	return element('mtext', escapeText(text), attrs);
}

/** Horizontal/vertical spacing element. */
export function mspace(attrs: MathMLAttrs): string {
	return emptyElement('mspace', attrs);
}

/** Groups a sequence of raw-markup children into a single row element. */
export function mrow(children: string, attrs?: MathMLAttrs): string {
	return element('mrow', children, attrs);
}

/** Wraps children in an `<mrow>` only when grouping is needed (more than one root). */
export function group(children: readonly string[]): string {
	if (children.length === 0) return '';
	if (children.length === 1) return children[0] ?? '';
	return mrow(children.join(''));
}

/** Fraction. `linethickness="0"` renders a binomial-style stack. */
export function mfrac(numerator: string, denominator: string, attrs?: MathMLAttrs): string {
	return element('mfrac', `${numerator}${denominator}`, attrs);
}

/** Square root. */
export function msqrt(radicand: string): string {
	return element('msqrt', radicand);
}

/** N-th root: radicand with an explicit index. */
export function mroot(radicand: string, index: string): string {
	return element('mroot', `${radicand}${index}`);
}

/** Superscript. */
export function msup(base: string, sup: string): string {
	return element('msup', `${base}${sup}`);
}

/** Subscript. */
export function msub(base: string, sub: string): string {
	return element('msub', `${base}${sub}`);
}

/** Combined sub- and superscript. */
export function msubsup(base: string, sub: string, sup: string): string {
	return element('msubsup', `${base}${sub}${sup}`);
}

/** Overscript (e.g. hat, bar, overbrace). */
export function mover(base: string, over: string, attrs?: MathMLAttrs): string {
	return element('mover', `${base}${over}`, attrs);
}

/** Underscript. */
export function munder(base: string, under: string, attrs?: MathMLAttrs): string {
	return element('munder', `${base}${under}`, attrs);
}

/** Combined under- and overscript (e.g. limits on a big operator). */
export function munderover(base: string, under: string, over: string): string {
	return element('munderover', `${base}${under}${over}`);
}

/** Table cell. */
export function mtd(content: string): string {
	return element('mtd', content);
}

/** Table row from already-built cells. */
export function mtr(cells: readonly string[]): string {
	return element('mtr', cells.map(mtd).join(''));
}

/** Table from a grid of cell-content strings. */
export function mtable(rows: readonly (readonly string[])[], attrs?: MathMLAttrs): string {
	return element('mtable', rows.map(mtr).join(''), attrs);
}

/** Styled subtree (e.g. forced display style, script level). */
export function mstyle(children: string, attrs: MathMLAttrs): string {
	return element('mstyle', children, attrs);
}
