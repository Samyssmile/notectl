/**
 * The exact, projected document model expected after {@link buildComplexDocument}
 * runs (see `complex-document.ts`). Authored with compact factories that mirror
 * the editor's serialized shape, so the headline test can assert
 * `projectDoc(actual) === EXPECTED_DOCUMENT` field-for-field.
 *
 * `// FINDING:` comments mark blocks that the editor produces today but that a
 * correct editor arguably should not. They are asserted here (current
 * behaviour) so the suite stays green and acts as a regression guard; the
 * matching ideal behaviour is encoded as skipped `test.fixme` cases in
 * `complex-document.spec.ts`.
 */
import { TINY_PNG } from './complex-document';

type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = Record<string, unknown>;

// ── Factories ──────────────────────────────────────────────────

function m(type: string, attrs?: Record<string, unknown>): Mark {
	return attrs ? { type, attrs } : { type };
}

function t(text: string, marks: Mark[] = []): Node {
	return { type: 'text', text, marks };
}

function p(children: Node[], attrs: Record<string, unknown> = {}): Node {
	return { type: 'paragraph', attrs: { dir: 'ltr', ...attrs }, children };
}

function emptyP(attrs: Record<string, unknown> = {}): Node {
	return p([t('')], attrs);
}

function h(level: number, text: string): Node {
	return { type: 'heading', attrs: { level, dir: 'ltr' }, children: [t(text)] };
}

function li(listType: string, text: string, extra: Record<string, unknown> = {}): Node {
	return {
		type: 'list_item',
		attrs: { listType, indent: 0, ...extra, dir: 'ltr' },
		children: [t(text)],
	};
}

function codeBlock(text: string): Node {
	return {
		type: 'code_block',
		attrs: { language: '', backgroundColor: '' },
		children: [t(text)],
	};
}

function blockquote(children: Node[]): Node {
	return { type: 'blockquote', attrs: { dir: 'ltr' }, children };
}

function cell(text: string): Node {
	return { type: 'table_cell', children: [p([t(text)])] };
}

function row(cells: Node[]): Node {
	return { type: 'table_row', children: cells };
}

function table(rows: Node[]): Node {
	return { type: 'table', children: rows };
}

function hr(): Node {
	return { type: 'horizontal_rule', children: [t('')] };
}

function hardBreak(): Node {
	return { type: 'inline', inlineType: 'hard_break', attrs: {} };
}

function mathInline(latex: string): Node {
	return {
		type: 'inline',
		inlineType: 'math_inline',
		attrs: { mathml: true, latex, alt: '', fontSize: '' },
	};
}

function mathDisplay(latex: string): Node {
	return {
		type: 'math_display',
		attrs: { mathml: true, latex, alt: '', fontSize: '' },
		children: [],
	};
}

function image(src: string): Node {
	return {
		type: 'image',
		attrs: { src, alt: '', align: 'center', width: 1, height: 1 },
		children: [],
	};
}

// ── Expected document ──────────────────────────────────────────

export const EXPECTED_DOCUMENT: { children: Node[] } = {
	children: [
		// 0
		h(1, 'Complex Document'),
		// 1 — toggle/shortcut marks, one per word, separators unmarked
		p([
			t('Marks: '),
			t('bold', [m('bold')]),
			t(' '),
			t('italic', [m('italic')]),
			t(' '),
			t('underline', [m('underline')]),
			t(' '),
			t('strike', [m('strikethrough')]),
			t(' '),
			t('code', [m('code')]),
			t(' '),
			t('sup', [m('superscript')]),
			t(' '),
			t('sub', [m('subscript')]),
			t(' '),
		]),
		// 2–7 — attribute/picker marks, isolated one per paragraph
		p([t('red', [m('textColor', { color: '#000000' })])]),
		p([t('yellow', [m('highlight', { color: '#fff176' })])]),
		p([t('firacode', [m('font', { family: "'Fira Code', monospace" })])]),
		p([t('big', [m('fontSize', { size: '24px' })])]),
		p([t('linky', [m('link', { href: 'https://example.com' })])]),
		p([t('shalom', [m('bdi', { dir: 'rtl' })])]),
		// 8 — inline formula amid text
		p([t('Euler '), mathInline('a^2+b^2'), t(' theorem')]),
		// 9
		codeBlock('const x = 42;'),
		// 10
		blockquote([p([t('A wise note.')])]),
		// 11
		h(2, 'Lists'),
		// 12–17
		li('bullet', 'Bullet one'),
		li('bullet', 'Bullet two'),
		li('ordered', 'Ordered one'),
		li('ordered', 'Ordered two'),
		li('checklist', 'Done thing', { checked: true }),
		li('checklist', 'Todo thing', { checked: false }),
		// 18
		h(2, 'Table'),
		// 19 — the table is inserted on the empty line, which is now consumed
		// (#152 fixed), so no stray empty paragraph precedes it.
		table([row([cell('Feature'), cell('Status')]), row([cell('Auth'), cell('Done')])]),
		// 20
		p([t('Centered paragraph.')], { align: 'center' }),
		// 21 — horizontal rule, again with no stray empty paragraph above (#152 fixed).
		hr(),
		// 22
		p([t('Right to left.')], { dir: 'rtl' }),
		// 23 — hard break inside a paragraph
		p([t('Line one'), hardBreak(), t('Line two')]),
		// 24 — display formula on its own line, no stray empty paragraph above (#152 fixed).
		mathDisplay('x=\\frac{1}{2}'),
		// 25
		image(TINY_PNG),
		// 26 — trailing paragraph (the legitimate cursor anchor after a void block)
		emptyP(),
		// 27 — second trailing empty paragraph. Residual double-trailing from the
		// display-formula→image sequence; a separate issue from #152 (see findings.md).
		emptyP(),
	],
};

/** Top-level block-type spine of the expected document. */
export const EXPECTED_TYPES: string[] = EXPECTED_DOCUMENT.children.map((c) => c.type as string);
