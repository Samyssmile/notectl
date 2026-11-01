import { describe, expect, it } from 'vitest';
import { createInlineNode, createTextNode } from '../../model/Document.js';
import { createCollapsedSelection } from '../../model/Selection.js';
import { blockId, inlineType, markType } from '../../model/TypeBrands.js';
import { invertTransaction } from '../../state/Transaction.js';
import { stateBuilder } from '../../test/TestUtils.js';
import { changeLink, resolveLinkRange } from './LinkRange.js';

const link = { type: markType('link'), attrs: { href: '/old', title: 'Keep title' } };
const bold = { type: markType('bold') };
function fixture() {
	return stateBuilder()
		.blockWithInlines(
			'paragraph',
			[
				createTextNode('one', [link]),
				createTextNode('two', [bold, link]),
				createTextNode('other', [{ ...link, attrs: { href: '/other' } }]),
			],
			'b1',
		)
		.cursor('b1', 2)
		.schema(['paragraph'], ['link', 'bold'])
		.build();
}
describe('whole-link operations', () => {
	it('edits only the complete formatted link, preserving title, formatting and selection', () => {
		const state = fixture();
		const range = resolveLinkRange(state);
		expect(range?.selection.head.offset).toBe(6);
		if (!range) throw new Error('Missing link');
		const tr = changeLink(state, range, '/new');
		if (!tr) throw new Error('Missing transaction');
		const next = state.apply(tr);
		expect(next.selection).toEqual(state.selection);
		expect(next.doc.children[0]?.children).toEqual([
			createTextNode('one', [{ ...link, attrs: { ...link.attrs, href: '/new' } }]),
			createTextNode('two', [bold, { ...link, attrs: { ...link.attrs, href: '/new' } }]),
			createTextNode('other', [{ ...link, attrs: { href: '/other' } }]),
		]);
		expect(next.apply(invertTransaction(tr)).doc).toEqual(state.doc);
	});
	it('removes only the resolved link and restores its attributes on undo', () => {
		const state = fixture();
		const range = resolveLinkRange(state);
		if (!range) throw new Error('Missing link');
		const tr = changeLink(state, range);
		if (!tr) throw new Error('Missing transaction');
		const next = state.apply(tr);
		expect(next.doc.children[0]?.children[2]).toEqual(state.doc.children[0]?.children[2]);
		expect(next.apply(invertTransaction(tr)).doc).toEqual(state.doc);
	});
	it('does not create an undo entry for an unchanged URL', () => {
		const state = fixture();
		const range = resolveLinkRange(state);
		if (!range) throw new Error('Missing link');
		expect(changeLink(state, range, '/old')).toBeNull();
	});
	it('counts inline nodes and stops at them', () => {
		const state = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[
					createTextNode('one', [link]),
					createInlineNode(inlineType('hard_break')),
					createTextNode('two', [link]),
				],
				'b1',
			)
			.cursor('b1', 5)
			.schema(['paragraph'], ['link'])
			.build();
		expect(resolveLinkRange(state)?.selection).toEqual({
			anchor: { blockId: 'b1', offset: 4 },
			head: { blockId: 'b1', offset: 7 },
		});
	});
	it('does not join links with different titles', () => {
		const state = stateBuilder()
			.blockWithInlines(
				'paragraph',
				[
					createTextNode('one', [link]),
					createTextNode('two', [{ ...link, attrs: { ...link.attrs, title: 'Other' } }]),
				],
				'b1',
			)
			.cursor('b1', 2)
			.schema(['paragraph'], ['link'])
			.build();
		expect(resolveLinkRange(state)?.selection.head.offset).toBe(3);
	});
	it('resolves reversed partial selections but rejects mixed ranges', () => {
		const state = fixture();
		const at = (offset: number) => ({ blockId: blockId('b1'), offset });
		expect(
			resolveLinkRange(state.withSelection({ anchor: at(5), head: at(1) }))?.selection.head.offset,
		).toBe(6);
		expect(resolveLinkRange(state.withSelection({ anchor: at(1), head: at(8) }))).toBeNull();
		expect(
			resolveLinkRange(state.withSelection(createCollapsedSelection(blockId('b1'), 8)))?.mark.attrs
				?.href,
		).toBe('/other');
	});
});
