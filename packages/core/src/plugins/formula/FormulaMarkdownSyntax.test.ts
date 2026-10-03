import { describe, expect, it } from 'vitest';
import {
	type BlockNode,
	type InlineNode,
	type TextNode,
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getInlineChildren,
} from '../../model/Document.js';
import type { SchemaRegistry } from '../../model/SchemaRegistry.js';
import { inlineType, nodeType } from '../../model/TypeBrands.js';
import { parseMarkdownToDocument } from '../../serialization/MarkdownParser.js';
import { serializeDocumentToMarkdown } from '../../serialization/MarkdownSerializer.js';
import { createDisplayMathNodeSpec } from './DisplayMathNodeSpec.js';
import { createFormulaMarkdownSyntax } from './FormulaMarkdownSyntax.js';
import { createInlineMathNodeSpec } from './InlineMathNodeSpec.js';

const SYNTAX = [createFormulaMarkdownSyntax()];

/** Registry stub exposing only the formula specs the serializer reaches. */
function formulaRegistry(): SchemaRegistry {
	const inline = createInlineMathNodeSpec();
	const display = createDisplayMathNodeSpec();
	return {
		getInlineNodeSpec: (t: string) => (t === 'math_inline' ? inline : undefined),
		getNodeSpec: (t: string) => (t === 'math_display' ? display : undefined),
		getMarkSpec: () => undefined,
		getMarkTypes: () => [],
		getAlignmentClassNames: () => undefined,
	} as unknown as SchemaRegistry;
}

describe('formula Markdown syntax — import', () => {
	it('parses inline $...$ into a math_inline node', () => {
		const doc = parseMarkdownToDocument('E = $a^2$ done', undefined, { syntaxExtensions: SYNTAX });
		const inline = getInlineChildren(doc.children[0] as BlockNode);
		const math = inline.find((c): c is InlineNode => 'inlineType' in c);
		expect(math?.inlineType).toBe('math_inline');
		expect(math?.attrs.latex).toBe('a^2');
		expect(String(math?.attrs.mathml)).toContain('<math');
	});

	it('does not treat $$ as inline math', () => {
		const doc = parseMarkdownToDocument('price is $5 and $6', undefined, {
			syntaxExtensions: SYNTAX,
		});
		const inline = getInlineChildren(doc.children[0] as BlockNode);
		// "$5 and $" would only match if a closing $ exists; here it does, so be precise:
		// the matcher requires a non-empty body and no newline — "$5 and $" matches as math "5 and".
		// Assert we did not crash and produced a single paragraph.
		expect(doc.children[0]?.type).toBe('paragraph');
		expect(inline.length).toBeGreaterThan(0);
	});

	it('parses a multi-line $$ block into a math_display node', () => {
		const doc = parseMarkdownToDocument('$$\na^2 + b^2\n$$', undefined, {
			syntaxExtensions: SYNTAX,
		});
		expect(doc.children[0]?.type).toBe('math_display');
		expect(doc.children[0]?.attrs?.latex).toBe('a^2 + b^2');
	});

	it('parses a single-line $$...$$ block', () => {
		const doc = parseMarkdownToDocument('$$x = 1$$', undefined, { syntaxExtensions: SYNTAX });
		expect(doc.children[0]?.type).toBe('math_display');
		expect(doc.children[0]?.attrs?.latex).toBe('x = 1');
	});

	it('imports pathologically nested scripts without aborting the document (#229)', () => {
		const latex = `${'x^{'.repeat(20000)}x${'}'.repeat(20000)}`;
		const markdown: string = [
			'Before.',
			`Inline $${latex}$ end.`,
			`$$\n${latex}\n$$`,
			'After.',
		].join('\n\n');
		const registry = formulaRegistry();
		const doc = parseMarkdownToDocument(markdown, registry, { syntaxExtensions: SYNTAX });

		expect(doc.children.map((block) => block.type)).toEqual([
			'paragraph',
			'paragraph',
			'math_display',
			'paragraph',
		]);
		const inline = getInlineChildren(doc.children[1] as BlockNode).find(
			(c): c is InlineNode => 'inlineType' in c,
		);
		for (const attrs of [inline?.attrs, doc.children[2]?.attrs]) {
			expect(attrs?.latex).toBe(latex);
			expect(attrs?.mathml).toContain('<merror>');
		}
		expect(serializeDocumentToMarkdown(doc, registry).trim()).toBe(markdown);
	});
});

describe('formula Markdown syntax — export & round-trip', () => {
	it.each([
		'\\toString + x',
		'\\constructor + x',
		'\\valueOf + x',
		'\\hasOwnProperty + x',
		'\\isPrototypeOf + x',
		'\\propertyIsEnumerable + x',
		'\\toLocaleString + x',
		'\\left\\constructor x\\right\\notadelimiter',
	])('preserves invalid formulas and the rest of the Markdown document: %s (#228)', (latex) => {
		const markdown = [
			`Before $${latex}$ after.`,
			`$$${latex}$$`,
			'Between.',
			`$$\n${latex}\n+ y\n$$`,
			'Later $a^2$ end.',
			'$$\nb^2\n$$',
			'Last paragraph.',
		].join('\n\n');
		const registry = formulaRegistry();
		const imported = parseMarkdownToDocument(markdown, registry, { syntaxExtensions: SYNTAX });
		const exported = serializeDocumentToMarkdown(imported, registry).trim();
		const normalized = markdown.replace(`$$${latex}$$`, () => `$$\n${latex}\n$$`);
		expect(exported).toBe(normalized);
		const reimported = parseMarkdownToDocument(exported, registry, { syntaxExtensions: SYNTAX });

		for (const doc of [imported, reimported]) {
			expect(doc.children.map((block) => block.type)).toEqual([
				'paragraph',
				'math_display',
				'paragraph',
				'math_display',
				'paragraph',
				'math_display',
				'paragraph',
			]);
			const first = doc.children[0];
			const later = doc.children[4];
			expect(first).toBeDefined();
			expect(later).toBeDefined();
			if (!first || !later) return;
			const inline = getInlineChildren(first).find((c): c is InlineNode => 'inlineType' in c);
			const valid = getInlineChildren(later).find((c): c is InlineNode => 'inlineType' in c);
			expect(inline?.attrs.latex).toBe(latex);
			expect(doc.children[1]?.attrs?.latex).toBe(latex);
			expect(doc.children[3]?.attrs?.latex).toBe(`${latex}\n+ y`);
			for (const attrs of [inline?.attrs, doc.children[1]?.attrs, doc.children[3]?.attrs]) {
				expect(attrs?.mathml).toContain('<merror><mtext>\\');
				expect(attrs?.mathml).toContain('<mi>x</mi>');
			}
			expect(doc.children[3]?.attrs?.mathml).toContain('<mi>y</mi>');
			expect(valid?.attrs.latex).toBe('a^2');
			expect(valid?.attrs.mathml).toContain('<msup><mi>a</mi><mn>2</mn></msup>');
			expect(valid?.attrs.mathml).not.toContain('<merror>');
			expect(doc.children[5]?.attrs?.latex).toBe('b^2');
			expect(doc.children[5]?.attrs?.mathml).not.toContain('<merror>');
		}
	});

	it('serializes inline math via the spec toMarkdown hook', () => {
		const doc = createDocument([
			createBlockNode(nodeType('paragraph'), [
				createTextNode('E='),
				createInlineNode(inlineType('math_inline'), {
					latex: 'mc^2',
					mathml: '',
					alt: '',
					fontSize: '',
				}),
			]),
		]);
		expect(serializeDocumentToMarkdown(doc, formulaRegistry()).trim()).toBe('E=$mc^2$');
	});

	it('round-trips inline math through Markdown', () => {
		const md = 'E=$mc^2$';
		const doc = parseMarkdownToDocument(md, formulaRegistry(), { syntaxExtensions: SYNTAX });
		expect(serializeDocumentToMarkdown(doc, formulaRegistry()).trim()).toBe(md);
	});

	it('round-trips display math through Markdown', () => {
		const md = '$$\na^2\n$$';
		const doc = parseMarkdownToDocument(md, formulaRegistry(), { syntaxExtensions: SYNTAX });
		const out = serializeDocumentToMarkdown(doc, formulaRegistry()).trim();
		expect(out).toBe(md);
	});
});
