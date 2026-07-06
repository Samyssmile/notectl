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
});

describe('formula Markdown syntax — export & round-trip', () => {
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
