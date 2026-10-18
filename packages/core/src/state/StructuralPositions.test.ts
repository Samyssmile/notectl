import { describe, expect, it } from 'vitest';
import { createBlockNode, createDocument, createTextNode } from '../model/Document.js';
import { createCollapsedSelection } from '../model/Selection.js';
import { blockId, nodeType } from '../model/TypeBrands.js';
import { EditorState } from './EditorState.js';
import { applyStep } from './StepHandlers.js';
import { TransactionBuilder, invertTransaction } from './Transaction.js';

const child = createBlockNode(nodeType('paragraph'), [createTextNode('child')], blockId('child'));
const parent = createBlockNode(nodeType('blockquote'), [child], blockId('parent'));
const added = createBlockNode(nodeType('paragraph'), [createTextNode('added')], blockId('added'));
const state = EditorState.create({
	doc: createDocument([parent]),
	selection: createCollapsedSelection(child.id, 0),
});
const paths = [[], [parent.id], [blockId('missing')], [parent.id, blockId('missing')]];
const invalidIndices = [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2];

describe('structural positions', () => {
	for (const parentPath of paths) {
		for (const index of invalidIndices) {
			it(`rejects insertNode at [${parentPath}] / ${index} without changing the builder`, () => {
				const builder = state.transaction();
				builder.insertText(child.id, 0, 'before ', []);
				const before = builder.build();
				expect(() => builder.insertNode(parentPath, index, added)).toThrow(
					/insertNode.*parent path.*index/,
				);
				const after = builder.build();
				expect(after.steps).toEqual(before.steps);
				expect(after.forwardStepMaps).toEqual(before.forwardStepMaps);
				expect(state.apply(after).doc).toEqual(state.apply(before).doc);
				builder.insertNode([parent.id], 1, added);
				expect(state.apply(builder.build()).getBlock(added.id)).toEqual(added);
			});

			it(`rejects invalid applied insert/remove at [${parentPath}] / ${index}`, () => {
				expect(() =>
					applyStep(state.doc, { type: 'insertNode', parentPath, index, node: added }),
				).toThrow(/insertNode.*parent path.*index/);
				expect(() =>
					applyStep(state.doc, { type: 'removeNode', parentPath, index, removedNode: child }),
				).toThrow(/removeNode.*parent path.*index/);
			});
		}
	}

	it('rejects missing parents even with index zero', () => {
		for (const parentPath of paths.slice(2)) {
			expect(() => state.transaction().insertNode(parentPath, 0, added)).toThrow(
				/insertNode.*parent path.*index 0/,
			);
			expect(() =>
				applyStep(state.doc, { type: 'insertNode', parentPath, index: 0, node: added }),
			).toThrow(/insertNode/);
		}
	});

	it('validates manual builders immediately for numeric indices and at application for document bounds', () => {
		const builder = new TransactionBuilder(state.selection, null);
		for (const index of invalidIndices.slice(0, -1)) {
			expect(() => builder.insertNode([], index, added)).toThrow(/insertNode/);
		}
		expect(builder.build().steps).toEqual([]);
		builder.insertNode([], 2, added);
		expect(() => state.apply(builder.build())).toThrow(/insertNode/);
	});

	it('rejects a stale inverse removal rather than deleting a different block', () => {
		const tr = state.transaction().insertNode([parent.id], 0, added).build();
		const changed = state
			.apply(tr)
			.apply(state.apply(tr).transaction().removeNode([parent.id], 0).build());
		expect(() => changed.apply(invertTransaction(tr))).toThrow(/removeNode.*parent path.*index 0/);
	});

	it('rejects missing removals and inline slots without recording steps or maps', () => {
		const builder = state.transaction();
		for (const [parentPath, index] of [
			[[], 1],
			[[parent.id], 1],
			[[child.id], 0],
			[[parent.id, child.id], 0],
		] as const) {
			expect(() => builder.removeNode(parentPath, index)).toThrow(/removeNode.*parent path.*index/);
		}
		expect(builder.build().steps).toEqual([]);
		expect(builder.build().forwardStepMaps).toEqual([]);
	});

	it('resolves valid boundaries against preceding insertions, splits, removals and parent creation', () => {
		const builder = state.transaction();
		builder.splitBlock(child.id, 2, blockId('tail'));
		builder.insertNode([parent.id], 2, added);
		builder.removeNode([parent.id], 0);
		builder.insertNode([], 1, createBlockNode(nodeType('blockquote'), [], blockId('new-parent')));
		builder.insertNode(
			[blockId('new-parent')],
			0,
			createBlockNode(nodeType('paragraph'), [], blockId('new-child')),
		);
		const tr = builder.build();
		const after = state.apply(tr);
		expect(
			after.getBlock(parent.id)?.children.map((node) => ('id' in node ? node.id : '')),
		).toEqual(['tail', 'added']);
		expect(after.getNodePath(blockId('new-child'))).toEqual(['new-parent', 'new-child']);
		expect(after.apply(invertTransaction(tr)).doc).toEqual(state.doc);
	});
});
