import { describe, expect, it } from 'vitest';
import type { BlockNode, Document, Mark } from '../model/Document.js';
import {
	createBlockNode,
	createInlineNode,
	createTextNode,
	getBlockChildren,
} from '../model/Document.js';
import { blockId, inlineType, markType, nodeType } from '../model/TypeBrands.js';
import { reuseBlockIdsByPath } from './BlockIdentity.js';

function paragraph(id: string, text = ''): BlockNode {
	return createBlockNode(nodeType('paragraph'), [createTextNode(text)], blockId(id));
}

function container(type: string, id: string, children: readonly BlockNode[]): BlockNode {
	return createBlockNode(nodeType(type), children, blockId(id));
}

function doc(...children: readonly BlockNode[]): Document {
	return { children };
}

/** Every block ID in document order (depth-first, parents before children). */
function idsOf(document: Document): string[] {
	const visit = (block: BlockNode): string[] => [
		block.id,
		...getBlockChildren(block).flatMap(visit),
	];
	return document.children.flatMap(visit);
}

describe('reuseBlockIdsByPath', () => {
	it('takes the ID of the block at the same path, at every depth', () => {
		const current: Document = doc(
			paragraph('intro'),
			container('blockquote', 'quote', [
				paragraph('quote-text'),
				container('blockquote', 'inner-quote', [paragraph('inner-text')]),
			]),
			container('table', 'table', [
				container('table_row', 'row', [container('table_cell', 'cell', [paragraph('cell-text')])]),
			]),
		);
		const next: Document = doc(
			paragraph('n1'),
			container('blockquote', 'n2', [
				paragraph('n3'),
				container('blockquote', 'n4', [paragraph('n5')]),
			]),
			container('table', 'n6', [
				container('table_row', 'n7', [container('table_cell', 'n8', [paragraph('n9')])]),
			]),
		);

		expect(idsOf(reuseBlockIdsByPath(next, current))).toEqual(idsOf(current));
	});

	it('keeps the own ID of a block without a counterpart at its path', () => {
		const current: Document = doc(container('blockquote', 'quote', [paragraph('quote-text')]));
		const next: Document = doc(
			container('blockquote', 'n1', [paragraph('n2'), paragraph('n3')]),
			paragraph('n4'),
		);

		expect(idsOf(reuseBlockIdsByPath(next, current))).toEqual(['quote', 'quote-text', 'n3', 'n4']);
	});

	it('matches by path regardless of block type and of inline content', () => {
		const current: Document = doc(paragraph('leaf', 'text'), paragraph('second'));
		const next: Document = doc(
			container('blockquote', 'n1', [paragraph('n2')]),
			createBlockNode(nodeType('heading'), [createTextNode('Title')], blockId('n3'), { level: 1 }),
		);

		expect(idsOf(reuseBlockIdsByPath(next, current))).toEqual(['leaf', 'n2', 'second']);
	});

	it('gives a fresh ID to a block whose own ID is reused later in the document', () => {
		const current: Document = doc(
			container('blockquote', 'quote', [paragraph('quote-text')]),
			paragraph('later'),
		);
		const next: Document = doc(
			container('blockquote', 'n1', [paragraph('n2'), paragraph('later')]),
			paragraph('n3'),
		);

		const ids: string[] = idsOf(reuseBlockIdsByPath(next, current));

		expect(ids).toEqual(['quote', 'quote-text', expect.stringMatching(/^block-/), 'later']);
	});

	it('gives a fresh ID to a repeated own ID', () => {
		const current: Document = doc(paragraph('first'));
		const next: Document = doc(paragraph('n1'), paragraph('dup'), paragraph('dup'));

		const ids: string[] = idsOf(reuseBlockIdsByPath(next, current));

		expect(ids).toEqual(['first', 'dup', expect.stringMatching(/^block-/)]);
	});

	it('changes nothing but block IDs', () => {
		const bold: Mark = { type: markType('bold') };
		const leaf: BlockNode = createBlockNode(
			nodeType('heading'),
			[
				createTextNode('Hi ', [bold]),
				createInlineNode(inlineType('formula'), { latex: 'x' }),
				createTextNode(' there'),
			],
			blockId('n2'),
			{ level: 2 },
			'section-1',
		);
		const next: Document = doc(container('blockquote', 'n1', [leaf]));
		const current: Document = doc(container('blockquote', 'quote', [paragraph('quote-text')]));

		const result: Document = reuseBlockIdsByPath(next, current);

		expect(result).toEqual(
			doc(container('blockquote', 'quote', [{ ...leaf, id: blockId('quote-text') }])),
		);
	});
});
