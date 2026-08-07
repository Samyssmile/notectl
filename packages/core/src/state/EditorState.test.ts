import { describe, expect, it } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createTextNode,
	getBlockText,
	getTextChildren,
} from '../model/Document.js';
import {
	createCollapsedSelection,
	createGapCursor,
	createNodeSelection,
	createSelection,
	isTextSelection,
} from '../model/Selection.js';
import type { BlockId } from '../model/TypeBrands.js';
import { markType } from '../model/TypeBrands.js';
import { EditorState } from './EditorState.js';
import { applySplitBlock } from './StepApplication.js';
import { TransactionBuilder } from './Transaction.js';

describe('EditorState', () => {
	describe('create', () => {
		it('creates default state with empty paragraph', () => {
			const state = EditorState.create();
			expect(state.doc.children).toHaveLength(1);
			expect(state.doc.children[0]?.type).toBe('paragraph');
			expect(state.storedMarks).toBeNull();
		});

		it('creates state with custom document', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({ doc });
			expect(getBlockText(state.doc.children[0])).toBe('hello');
		});

		it('owns and freezes the document snapshot supplied by the caller', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({ doc });
			const sourceText = doc.children[0]?.children[0] as { text: string } | undefined;
			if (sourceText) sourceText.text = 'changed outside';

			expect(getBlockText(state.doc.children[0])).toBe('hello');
			expect(Object.isFrozen(state.doc)).toBe(true);
			expect(Object.isFrozen(state.doc.children)).toBe(true);
			expect(Object.isFrozen(state.doc.children[0]?.children[0])).toBe(true);
			expect(Object.isFrozen(state.getBlockOrder())).toBe(true);
		});

		it('defaults selection to the first leaf block in nested documents', () => {
			const doc = createDocument([
				createBlockNode(
					'table',
					[
						createBlockNode(
							'table_row',
							[
								createBlockNode(
									'table_cell',
									[createBlockNode('paragraph', [createTextNode('cell')], 'p1')],
									'cell1',
								),
							],
							'row1',
						),
					],
					'tbl1',
				),
			]);

			const state = EditorState.create({ doc });

			expect(state.selection.anchor.blockId).toBe('p1');
			expect(state.selection.anchor.offset).toBe(0);
		});
	});

	describe('apply - insertText', () => {
		it('inserts text at cursor position', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = new TransactionBuilder(state.selection, null, 'input')
				.insertText('b1', 0, 'hello', [])
				.setSelection(createCollapsedSelection('b1', 5))
				.build();

			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('hello');
			expect(newState.selection.anchor.offset).toBe(5);
		});

		it('inserts text with marks', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = new TransactionBuilder(state.selection, null, 'input')
				.insertText('b1', 0, 'bold', [{ type: 'bold' }])
				.setSelection(createCollapsedSelection('b1', 4))
				.build();

			const newState = state.apply(tr);
			const children = getTextChildren(newState.doc.children[0]);
			expect(children[0]?.text).toBe('bold');
			expect(children[0]?.marks).toEqual([{ type: 'bold' }]);
		});
	});

	describe('apply - deleteText', () => {
		it('deletes text range', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 11),
			});

			const tr = new TransactionBuilder(state.selection, null, 'input')
				.deleteText('b1', 5, 11, ' world', [])
				.setSelection(createCollapsedSelection('b1', 5))
				.build();

			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('hello');
		});
	});

	describe('apply - stored marks', () => {
		it('owns and deeply freezes marks accepted from a transaction', () => {
			const state = EditorState.create({
				doc: createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]),
				selection: createCollapsedSelection('b1', 0),
			});
			const transaction = state
				.transaction('command')
				.setStoredMarks([{ type: markType('link'), attrs: { href: 'https://example.com' } }], null)
				.build();

			const next = state.apply(transaction);

			expect(Object.isFrozen(next.storedMarks)).toBe(true);
			expect(Object.isFrozen(next.storedMarks?.[0])).toBe(true);
			expect(Object.isFrozen(next.storedMarks?.[0]?.attrs)).toBe(true);
		});
	});

	describe('apply - splitBlock', () => {
		it('splits a block into two', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});

			const tr = new TransactionBuilder(state.selection, null, 'input')
				.splitBlock('b1', 5, 'b2')
				.setSelection(createCollapsedSelection('b2', 0))
				.build();

			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(2);
			expect(getBlockText(newState.doc.children[0])).toBe('hello');
			expect(getBlockText(newState.doc.children[1])).toBe(' world');
		});

		it('keeps a semantic HTML ID only on the original half', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1', undefined, 'target'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});
			const transaction = new TransactionBuilder(state.selection, null, 'input', state.doc)
				.splitBlock('b1', 5, 'b2')
				.setSelection(createCollapsedSelection('b2', 0))
				.build();

			const next = state.apply(transaction);

			expect(next.doc.children[0]?.htmlId).toBe('target');
			expect(next.doc.children[1]?.htmlId).toBeUndefined();
		});

		it('applies an explicit HTML-ID-only override to the new half', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);

			const next = applySplitBlock(doc, {
				type: 'splitBlock',
				blockId: 'b1',
				offset: 5,
				newBlockId: 'b2',
				newBlockHTMLId: 'tail-target',
			});

			expect(next.children[1]?.type).toBe('paragraph');
			expect(next.children[1]?.htmlId).toBe('tail-target');
		});
	});

	describe('apply - mergeBlocks', () => {
		it('merges two blocks into one', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				createBlockNode('paragraph', [createTextNode(' world')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b2', 0),
			});

			const tr = new TransactionBuilder(state.selection, null, 'input')
				.mergeBlocks('b1', 'b2', 5)
				.setSelection(createCollapsedSelection('b1', 5))
				.build();

			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(1);
			expect(getBlockText(newState.doc.children[0])).toBe('hello world');
		});
	});

	describe('apply - addMark', () => {
		it('adds a mark to a text range', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({ doc });

			const tr = new TransactionBuilder(state.selection, null, 'command')
				.addMark('b1', 0, 5, { type: 'bold' })
				.setSelection(state.selection)
				.build();

			const newState = state.apply(tr);
			expect(getTextChildren(newState.doc.children[0])[0]?.marks).toEqual([{ type: 'bold' }]);
		});

		it('adds mark to partial range, splitting text nodes', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			const state = EditorState.create({ doc });

			const tr = new TransactionBuilder(state.selection, null, 'command')
				.addMark('b1', 0, 5, { type: 'bold' })
				.setSelection(state.selection)
				.build();

			const newState = state.apply(tr);
			const children = getTextChildren(newState.doc.children[0]);
			expect(children).toHaveLength(2);
			expect(children[0]?.text).toBe('hello');
			expect(children[0]?.marks).toEqual([{ type: 'bold' }]);
			expect(children[1]?.text).toBe(' world');
			expect(children[1]?.marks).toEqual([]);
		});
	});

	describe('apply - removeMark', () => {
		it('removes a mark from a text range', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('bold', [{ type: 'bold' }])], 'b1'),
			]);
			const state = EditorState.create({ doc });

			const tr = new TransactionBuilder(state.selection, null, 'command')
				.removeMark('b1', 0, 4, { type: 'bold' })
				.setSelection(state.selection)
				.build();

			const newState = state.apply(tr);
			expect(getTextChildren(newState.doc.children[0])[0]?.marks).toEqual([]);
		});
	});

	describe('apply - selection validation', () => {
		it('falls back to first block when selection references non-existent blockId', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				createBlockNode('paragraph', [createTextNode('world')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			// Build a transaction that removes b2, but sets selection to b2
			const tr = new TransactionBuilder(state.selection, null, 'command', doc)
				.removeNode([], 1)
				.setSelection(createCollapsedSelection('gone' as BlockId, 3))
				.build();

			const newState = state.apply(tr);
			expect(newState.selection.anchor.blockId).toBe('b1');
			expect(newState.selection.anchor.offset).toBe(0);
		});

		it('clamps offset when it exceeds block length', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hi')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = new TransactionBuilder(state.selection, null, 'command')
				.setSelection(createCollapsedSelection('b1', 99))
				.build();

			const newState = state.apply(tr);
			expect(newState.selection.anchor.blockId).toBe('b1');
			expect(newState.selection.anchor.offset).toBe(2);
		});

		it('normalizes negative and non-finite offsets', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hi')], 'b1')]);
			const state = EditorState.create({ doc });

			const negative = state.withSelection(createCollapsedSelection('b1', -3));
			const nonFinite = state.withSelection(createCollapsedSelection('b1', Number.NaN));

			expect(negative.selection.anchor.offset).toBe(0);
			expect(nonFinite.selection.anchor.offset).toBe(0);
		});

		it('preserves a valid selection value', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const sel = createCollapsedSelection('b1', 3);
			const tr = new TransactionBuilder(state.selection, null, 'command').setSelection(sel).build();

			const newState = state.apply(tr);
			expect(newState.selection).toEqual(sel);
			expect(newState.selection).not.toBe(sel);
		});

		it('handles multi-block selection where head block is removed', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('first')], 'b1'),
				createBlockNode('paragraph', [createTextNode('second')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = new TransactionBuilder(state.selection, null, 'command', doc)
				.removeNode([], 1)
				.setSelection(
					createSelection(
						{ blockId: 'b1' as BlockId, offset: 2 },
						{ blockId: 'b2' as BlockId, offset: 3 },
					),
				)
				.build();

			const newState = state.apply(tr);
			// Anchor is valid
			expect(newState.selection.anchor.blockId).toBe('b1');
			expect(newState.selection.anchor.offset).toBe(2);
			// Head falls back to first block
			expect(newState.selection.head.blockId).toBe('b1');
			expect(newState.selection.head.offset).toBe(0);
		});
	});

	describe('toJSON / fromJSON', () => {
		it('roundtrips state through JSON', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 3),
			});

			const json = state.toJSON() as { doc: typeof doc; selection: typeof state.selection };
			const restored = EditorState.fromJSON(json);

			expect(getBlockText(restored.doc.children[0])).toBe('hello');
			expect(restored.selection.anchor.offset).toBe(3);
		});

		it('does not share mutable JSON objects with either state', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 3),
			});

			const json = state.toJSON() as {
				doc: { children: Array<{ children: Array<{ text: string }> }> };
				selection: { anchor: { offset: number }; head: { offset: number } };
			};
			const restored = EditorState.fromJSON(json as never);
			json.doc.children[0]?.children.splice(0, 1, {
				text: 'changed outside both states',
			});
			json.selection.anchor.offset = 0;

			expect(getBlockText(state.doc.children[0])).toBe('hello');
			expect(getBlockText(restored.doc.children[0])).toBe('hello');
			expect(state.selection.anchor.offset).toBe(3);
			expect(restored.selection.anchor.offset).toBe(3);
		});
	});

	describe('withSelection', () => {
		it('preserves a valid selection without retaining the caller-owned object', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({ doc, selection: createCollapsedSelection('b1', 0) });
			const sel = createCollapsedSelection('b1', 3);

			const result = state.withSelection(sel);

			expect(result.selection).toEqual(sel);
			expect(result.selection).not.toBe(sel);
			expect(result.doc).toBe(state.doc);
			expect(result.schema).toBe(state.schema);
		});

		it('clamps offset when text is shorter than selection offset', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hi')], 'b1')]);
			const state = EditorState.create({ doc });

			const result = state.withSelection(createCollapsedSelection('b1', 10));

			expect(result.selection.anchor.blockId).toBe('b1');
			expect(result.selection.anchor.offset).toBe(2);
		});

		it('falls back to first leaf block when block no longer exists', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('only')], 'b1')]);
			const state = EditorState.create({ doc });

			const result = state.withSelection(createCollapsedSelection('gone' as BlockId, 5));

			expect(result.selection.anchor.blockId).toBe('b1');
			expect(result.selection.anchor.offset).toBe(0);
		});

		it('preserves NodeSelection on a surviving block', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('text')], 'b1')]);
			const state = EditorState.create({ doc });
			const nodeSel = createNodeSelection('b1' as BlockId, []);

			const result = state.withSelection(nodeSel);

			expect(result.selection).toEqual(nodeSel);
			expect(result.selection).not.toBe(nodeSel);
		});

		it('falls back from NodeSelection on a removed block', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('text')], 'b1')]);
			const state = EditorState.create({ doc });
			const nodeSel = createNodeSelection('gone' as BlockId, []);

			const result = state.withSelection(nodeSel);

			expect(isTextSelection(result.selection)).toBe(true);
			if (isTextSelection(result.selection)) {
				expect(result.selection.anchor.blockId).toBe('b1');
			}
		});

		it('preserves GapCursor on a surviving block', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('text')], 'b1')]);
			const state = EditorState.create({ doc });
			const gapSel = createGapCursor('b1' as BlockId, 'before', []);

			const result = state.withSelection(gapSel);

			expect(result.selection).toEqual(gapSel);
			expect(result.selection).not.toBe(gapSel);
		});

		it('falls back from GapCursor on a removed block', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('text')], 'b1')]);
			const state = EditorState.create({ doc });
			const gapSel = createGapCursor('gone' as BlockId, 'before', []);

			const result = state.withSelection(gapSel);

			expect(isTextSelection(result.selection)).toBe(true);
			if (isTextSelection(result.selection)) {
				expect(result.selection.anchor.blockId).toBe('b1');
			}
		});

		it('preserves range selection across two surviving blocks', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('first')], 'b1'),
				createBlockNode('paragraph', [createTextNode('second')], 'b2'),
			]);
			const state = EditorState.create({ doc });
			const rangeSel = createSelection(
				{ blockId: 'b1' as BlockId, offset: 2 },
				{ blockId: 'b2' as BlockId, offset: 4 },
			);

			const result = state.withSelection(rangeSel);

			expect(result.selection.anchor.blockId).toBe('b1');
			expect(result.selection.anchor.offset).toBe(2);
			expect(result.selection.head.blockId).toBe('b2');
			expect(result.selection.head.offset).toBe(4);
		});
	});

	describe('validateSelection fallback', () => {
		it('moves a text selection from a container block to its first leaf descendant', () => {
			const doc = createDocument([
				createBlockNode(
					'table',
					[
						createBlockNode(
							'table_row',
							[
								createBlockNode(
									'table_cell',
									[createBlockNode('paragraph', [createTextNode('cell')], 'p1')],
									'cell1',
								),
							],
							'row1',
						),
					],
					'table1',
				),
			]);
			const state = EditorState.create({ doc });

			const result = state.withSelection(createCollapsedSelection('table1', 99));

			expect(isTextSelection(result.selection)).toBe(true);
			if (isTextSelection(result.selection)) {
				expect(result.selection.anchor.blockId).toBe('p1');
				expect(result.selection.anchor.offset).toBe(0);
			}
		});

		it('falls back to the first leaf rather than the first top-level container', () => {
			const doc = createDocument([
				createBlockNode(
					'blockquote',
					[createBlockNode('paragraph', [createTextNode('nested')], 'p1')],
					'quote1',
				),
			]);
			const state = EditorState.create({ doc });

			const result = state.withSelection(createCollapsedSelection('missing' as BlockId, 5));

			expect(isTextSelection(result.selection)).toBe(true);
			if (isTextSelection(result.selection)) {
				expect(result.selection.anchor.blockId).toBe('p1');
				expect(result.selection.anchor.offset).toBe(0);
			}
		});

		it('GapCursor on deleted block falls back to first leaf block', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('Hello')], 'b1'),
				createBlockNode('paragraph', [createTextNode('World')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			// Build a transaction that removes b2 but sets GapCursor on b2
			const tr = state
				.transaction('input')
				.removeNode([], 1)
				.setSelection(createGapCursor('b2' as BlockId, 'before', []))
				.build();

			const newState = state.apply(tr);
			// b2 no longer exists, so selection should fall back
			expect(isTextSelection(newState.selection)).toBe(true);
			if (isTextSelection(newState.selection)) {
				expect(newState.selection.anchor.blockId).toBe('b1');
			}
		});

		it('NodeSelection on deleted block falls back to first leaf block', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('Hello')], 'b1'),
				createBlockNode('paragraph', [createTextNode('World')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = state
				.transaction('input')
				.removeNode([], 1)
				.setSelection(createNodeSelection('b2' as BlockId, []))
				.build();

			const newState = state.apply(tr);
			expect(isTextSelection(newState.selection)).toBe(true);
			if (isTextSelection(newState.selection)) {
				expect(newState.selection.anchor.blockId).toBe('b1');
			}
		});
	});
});
