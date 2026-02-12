import { describe, expect, it } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getBlockLength,
	getBlockText,
	getContentAtOffset,
	getInlineChildren,
	getTextChildren,
	isInlineNode,
	isTextNode,
} from '../model/Document.js';
import type { InlineNode } from '../model/Document.js';
import { createCollapsedSelection, createSelection } from '../model/Selection.js';
import { inlineType } from '../model/TypeBrands.js';
import { EditorState } from './EditorState.js';
import { applyStep } from './StepApplication.js';
import { TransactionBuilder, invertStep, invertTransaction } from './Transaction.js';
import type {
	AddMarkStep,
	DeleteTextStep,
	InsertInlineNodeStep,
	InsertTextStep,
	RemoveInlineNodeStep,
	SetInlineNodeAttrStep,
	SplitBlockStep,
} from './Transaction.js';

describe('Transaction', () => {
	describe('TransactionBuilder', () => {
		it('builds a transaction with steps', () => {
			const sel = createCollapsedSelection('b1', 0);
			const tr = new TransactionBuilder(sel, null, 'input')
				.insertText('b1', 0, 'a', [])
				.setSelection(createCollapsedSelection('b1', 1))
				.build();

			expect(tr.steps).toHaveLength(1);
			expect(tr.steps[0]?.type).toBe('insertText');
			expect(tr.selectionAfter.anchor.offset).toBe(1);
			expect(tr.metadata.origin).toBe('input');
		});

		it('supports fluent chaining', () => {
			const sel = createCollapsedSelection('b1', 0);
			const tr = new TransactionBuilder(sel, null, 'command')
				.addMark('b1', 0, 5, { type: 'bold' })
				.addMark('b1', 0, 5, { type: 'italic' })
				.setSelection(sel)
				.build();

			expect(tr.steps).toHaveLength(2);
		});

		it('deleteText falls back to single segment when no workingDoc and no explicit segments', () => {
			const sel = createCollapsedSelection('b1', 0);
			const tr = new TransactionBuilder(sel, null, 'input')
				.deleteText('b1', 0, 5, 'hello', [{ type: 'bold' }])
				.setSelection(sel)
				.build();

			const step = tr.steps[0] as DeleteTextStep;
			expect(step.deletedSegments).toEqual([{ text: 'hello', marks: [{ type: 'bold' }] }]);
		});

		it('deleteText auto-derives segments from workingDoc when no explicit segments provided', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('bold', [{ type: 'bold' }]), createTextNode('plain', [])],
					'b1',
				),
			]);
			const sel = createCollapsedSelection('b1', 0);
			const tr = new TransactionBuilder(sel, null, 'input', doc)
				.deleteText('b1', 0, 9, 'boldplain', [{ type: 'bold' }])
				.setSelection(sel)
				.build();

			const step = tr.steps[0] as DeleteTextStep;
			expect(step.deletedSegments).toHaveLength(2);
			expect(step.deletedSegments[0]).toEqual({ text: 'bold', marks: [{ type: 'bold' }] });
			expect(step.deletedSegments[1]).toEqual({ text: 'plain', marks: [] });
		});

		it('deleteText preserves explicit segments when provided', () => {
			const sel = createCollapsedSelection('b1', 0);
			const segments = [
				{ text: 'he', marks: [{ type: 'bold' }] },
				{ text: 'llo', marks: [] },
			];
			const tr = new TransactionBuilder(sel, null, 'input')
				.deleteText('b1', 0, 5, 'hello', [{ type: 'bold' }], segments)
				.setSelection(sel)
				.build();

			const step = tr.steps[0] as DeleteTextStep;
			expect(step.deletedSegments).toEqual(segments);
		});
	});

	describe('invertStep', () => {
		it('inverts insertText to deleteText', () => {
			const step: InsertTextStep = {
				type: 'insertText',
				blockId: 'b1',
				offset: 0,
				text: 'hello',
				marks: [],
			};
			const inverted = invertStep(step);
			expect(inverted.type).toBe('deleteText');
			expect((inverted as DeleteTextStep).from).toBe(0);
			expect((inverted as DeleteTextStep).to).toBe(5);
			expect((inverted as DeleteTextStep).deletedSegments).toEqual([{ text: 'hello', marks: [] }]);
		});

		it('inverts deleteText to insertText with segments always present', () => {
			const step: DeleteTextStep = {
				type: 'deleteText',
				blockId: 'b1',
				from: 0,
				to: 5,
				deletedText: 'hello',
				deletedMarks: [{ type: 'bold' }],
				deletedSegments: [{ text: 'hello', marks: [{ type: 'bold' }] }],
			};
			const inverted = invertStep(step);
			expect(inverted.type).toBe('insertText');
			expect((inverted as InsertTextStep).text).toBe('hello');
			expect((inverted as InsertTextStep).marks).toEqual([{ type: 'bold' }]);
			expect((inverted as InsertTextStep).segments).toEqual([
				{ text: 'hello', marks: [{ type: 'bold' }] },
			]);
		});

		it('inverts multi-segment deleteText preserving per-segment marks', () => {
			const step: DeleteTextStep = {
				type: 'deleteText',
				blockId: 'b1',
				from: 0,
				to: 10,
				deletedText: 'boldnormal',
				deletedMarks: [{ type: 'bold' }],
				deletedSegments: [
					{ text: 'bold', marks: [{ type: 'bold' }] },
					{ text: 'normal', marks: [] },
				],
			};
			const inverted = invertStep(step);
			const insertStep = inverted as InsertTextStep;
			expect(insertStep.segments).toEqual([
				{ text: 'bold', marks: [{ type: 'bold' }] },
				{ text: 'normal', marks: [] },
			]);
		});

		it('inverts addMark to removeMark', () => {
			const step: AddMarkStep = {
				type: 'addMark',
				blockId: 'b1',
				from: 0,
				to: 5,
				mark: { type: 'bold' },
			};
			const inverted = invertStep(step);
			expect(inverted.type).toBe('removeMark');
		});

		it('inverts splitBlock to mergeBlocks', () => {
			const step: SplitBlockStep = {
				type: 'splitBlock',
				blockId: 'b1',
				offset: 5,
				newBlockId: 'b2',
			};
			const inverted = invertStep(step);
			expect(inverted.type).toBe('mergeBlocks');
		});
	});

	describe('invertTransaction', () => {
		it('inverts transaction with reversed steps and swapped selections', () => {
			const selBefore = createCollapsedSelection('b1', 0);
			const selAfter = createCollapsedSelection('b1', 5);

			const tr = new TransactionBuilder(selBefore, null, 'input')
				.insertText('b1', 0, 'hello', [])
				.setSelection(selAfter)
				.build();

			const inverted = invertTransaction(tr);
			expect(inverted.selectionBefore).toEqual(tr.selectionAfter);
			expect(inverted.selectionAfter).toEqual(tr.selectionBefore);
			expect(inverted.steps[0]?.type).toBe('deleteText');
			expect(inverted.metadata.origin).toBe('history');
		});
	});

	describe('mark preservation through public API', () => {
		it('undo via TransactionBuilder.deleteText() without explicit segments auto-derives from workingDoc', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('bold', [{ type: 'bold' }]), createTextNode('plain', [])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			// deleteText() without explicit segments — auto-derives from workingDoc
			const tr = state
				.transaction('command')
				.deleteText('b1', 0, 9, 'boldplain', [{ type: 'bold' }])
				.setSelection(createCollapsedSelection('b1', 0))
				.build();

			const afterDelete = state.apply(tr);
			expect(getBlockText(afterDelete.doc.children[0])).toBe('');

			// Undo should restore with per-node segments (full mark preservation)
			const undoTr = invertTransaction(tr);
			const afterUndo = afterDelete.apply(undoTr);
			expect(getBlockText(afterUndo.doc.children[0])).toBe('boldplain');

			// Auto-derived segments now preserve per-node marks
			const step = tr.steps[0] as DeleteTextStep;
			expect(step.deletedSegments).toBeDefined();
			expect(step.deletedSegments).toHaveLength(2);
			expect(step.deletedSegments[0]).toEqual({ text: 'bold', marks: [{ type: 'bold' }] });
			expect(step.deletedSegments[1]).toEqual({ text: 'plain', marks: [] });

			// Verify undo fully restores marks
			const children = getTextChildren(afterUndo.doc.children[0]);
			const hasBold = children.some(
				(c) => c.text.includes('bold') && c.marks.some((m) => m.type === 'bold'),
			);
			const hasPlain = children.some((c) => c.text.includes('plain') && c.marks.length === 0);
			expect(hasBold).toBe(true);
			expect(hasPlain).toBe(true);
		});

		it('undo via TransactionBuilder.deleteText() with explicit segments fully preserves marks', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('bold', [{ type: 'bold' }]), createTextNode('plain', [])],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			// Use deleteText() with explicit segments (as deleteTextAt would provide)
			const segments = [
				{ text: 'bold', marks: [{ type: 'bold' }] as const },
				{ text: 'plain', marks: [] as const },
			];
			const tr = state
				.transaction('command')
				.deleteText('b1', 0, 9, 'boldplain', [{ type: 'bold' }], segments)
				.setSelection(createCollapsedSelection('b1', 0))
				.build();

			const afterDelete = state.apply(tr);
			const undoTr = invertTransaction(tr);
			const afterUndo = afterDelete.apply(undoTr);

			const restoredBlock = afterUndo.doc.children[0];
			expect(getBlockText(restoredBlock)).toBe('boldplain');

			const children = getTextChildren(restoredBlock);
			const hasBold = children.some(
				(c) => c.text.includes('bold') && c.marks.some((m) => m.type === 'bold'),
			);
			const hasPlain = children.some((c) => c.text.includes('plain') && c.marks.length === 0);
			expect(hasBold).toBe(true);
			expect(hasPlain).toBe(true);
		});

		it('deleteTextAt always provides segments for correct undo', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[
						createTextNode('AB', [{ type: 'bold' }, { type: 'italic' }]),
						createTextNode('CD', [{ type: 'italic' }]),
						createTextNode('EF', []),
					],
					'b1',
				),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 6),
			});

			const tr = state
				.transaction('input')
				.deleteTextAt('b1', 0, 6)
				.setSelection(createCollapsedSelection('b1', 0))
				.build();

			const step = tr.steps[0] as DeleteTextStep;
			expect(step.deletedSegments).toHaveLength(3);
			expect(step.deletedSegments[0]).toEqual({
				text: 'AB',
				marks: [{ type: 'bold' }, { type: 'italic' }],
			});
			expect(step.deletedSegments[1]).toEqual({ text: 'CD', marks: [{ type: 'italic' }] });
			expect(step.deletedSegments[2]).toEqual({ text: 'EF', marks: [] });

			// Full roundtrip: delete → undo → verify
			const afterDelete = state.apply(tr);
			expect(getBlockText(afterDelete.doc.children[0])).toBe('');

			const undoTr = invertTransaction(tr);
			const afterUndo = afterDelete.apply(undoTr);

			const restored = afterUndo.doc.children[0];
			expect(getBlockText(restored)).toBe('ABCDEF');

			const children = getTextChildren(restored);
			expect(children.some((c) => c.text === 'EF' && c.marks.length === 0)).toBe(true);
			expect(children.some((c) => c.text === 'AB' && c.marks.length === 2)).toBe(true);
		});
	});

	describe('InlineNode steps', () => {
		const imgType = inlineType('image');

		describe('insertInlineNode', () => {
			it('inserts InlineNode at offset in text', () => {
				const doc = createDocument([createBlockNode('paragraph', [createTextNode('abcd')], 'b1')]);
				const step: InsertInlineNodeStep = {
					type: 'insertInlineNode',
					blockId: 'b1',
					offset: 2,
					node: createInlineNode(imgType, { src: 'x.png' }),
				};
				const result = applyStep(doc, step);
				const block = result.children[0];
				// "ab" + inline + "cd" → length 5
				expect(getBlockLength(block)).toBe(5);
				const content = getContentAtOffset(block, 2);
				expect(content?.kind).toBe('inline');
			});

			it('inserts InlineNode at the start', () => {
				const doc = createDocument([createBlockNode('paragraph', [createTextNode('text')], 'b1')]);
				const step: InsertInlineNodeStep = {
					type: 'insertInlineNode',
					blockId: 'b1',
					offset: 0,
					node: createInlineNode(imgType),
				};
				const result = applyStep(doc, step);
				const block = result.children[0];
				expect(getBlockLength(block)).toBe(5);
				const content = getContentAtOffset(block, 0);
				expect(content?.kind).toBe('inline');
			});

			it('inserts InlineNode at the end', () => {
				const doc = createDocument([createBlockNode('paragraph', [createTextNode('text')], 'b1')]);
				const step: InsertInlineNodeStep = {
					type: 'insertInlineNode',
					blockId: 'b1',
					offset: 4,
					node: createInlineNode(imgType),
				};
				const result = applyStep(doc, step);
				const block = result.children[0];
				expect(getBlockLength(block)).toBe(5);
			});
		});

		describe('removeInlineNode', () => {
			it('removes InlineNode at offset', () => {
				const inline: InlineNode = createInlineNode(imgType);
				const doc = createDocument([
					createBlockNode('paragraph', [createTextNode('ab'), inline, createTextNode('cd')], 'b1'),
				]);
				const step: RemoveInlineNodeStep = {
					type: 'removeInlineNode',
					blockId: 'b1',
					offset: 2,
					removedNode: inline,
				};
				const result = applyStep(doc, step);
				const block = result.children[0];
				expect(getBlockText(block)).toBe('abcd');
				expect(getBlockLength(block)).toBe(4);
			});
		});

		describe('setInlineNodeAttr', () => {
			it('updates attrs on InlineNode', () => {
				const inline: InlineNode = createInlineNode(imgType, { src: 'old.png' });
				const doc = createDocument([
					createBlockNode('paragraph', [createTextNode('ab'), inline, createTextNode('cd')], 'b1'),
				]);
				const step: SetInlineNodeAttrStep = {
					type: 'setInlineNodeAttr',
					blockId: 'b1',
					offset: 2,
					attrs: { src: 'new.png' },
					previousAttrs: { src: 'old.png' },
				};
				const result = applyStep(doc, step);
				const block = result.children[0];
				const content = getContentAtOffset(block, 2);
				expect(content?.kind).toBe('inline');
				if (content?.kind === 'inline') {
					expect(content.node.attrs).toEqual({ src: 'new.png' });
				}
			});
		});

		describe('step inversion for InlineNode steps', () => {
			it('inverts insertInlineNode to removeInlineNode', () => {
				const node: InlineNode = createInlineNode(imgType);
				const step: InsertInlineNodeStep = {
					type: 'insertInlineNode',
					blockId: 'b1',
					offset: 3,
					node,
				};
				const inverted = invertStep(step);
				expect(inverted.type).toBe('removeInlineNode');
				expect((inverted as RemoveInlineNodeStep).removedNode).toBe(node);
				expect((inverted as RemoveInlineNodeStep).offset).toBe(3);
			});

			it('inverts removeInlineNode to insertInlineNode', () => {
				const node: InlineNode = createInlineNode(imgType);
				const step: RemoveInlineNodeStep = {
					type: 'removeInlineNode',
					blockId: 'b1',
					offset: 3,
					removedNode: node,
				};
				const inverted = invertStep(step);
				expect(inverted.type).toBe('insertInlineNode');
				expect((inverted as InsertInlineNodeStep).node).toBe(node);
			});

			it('inverts setInlineNodeAttr swapping attrs', () => {
				const step: SetInlineNodeAttrStep = {
					type: 'setInlineNodeAttr',
					blockId: 'b1',
					offset: 2,
					attrs: { src: 'new.png' },
					previousAttrs: { src: 'old.png' },
				};
				const inverted = invertStep(step);
				expect(inverted.type).toBe('setInlineNodeAttr');
				const inv = inverted as SetInlineNodeAttrStep;
				expect(inv.attrs).toEqual({ src: 'old.png' });
				expect(inv.previousAttrs).toEqual({ src: 'new.png' });
			});
		});

		describe('roundtrip: insert + undo', () => {
			it('insert InlineNode then undo restores original', () => {
				const doc = createDocument([createBlockNode('paragraph', [createTextNode('abcd')], 'b1')]);
				const state = EditorState.create({
					doc,
					selection: createCollapsedSelection('b1', 2),
				});

				const tr = state
					.transaction('command')
					.insertInlineNode('b1', 2, createInlineNode(imgType, { src: 'test.png' }))
					.setSelection(createCollapsedSelection('b1', 3))
					.build();

				const afterInsert = state.apply(tr);
				expect(getBlockLength(afterInsert.doc.children[0])).toBe(5);

				const undoTr = invertTransaction(tr);
				const afterUndo = afterInsert.apply(undoTr);
				expect(getBlockText(afterUndo.doc.children[0])).toBe('abcd');
				expect(getBlockLength(afterUndo.doc.children[0])).toBe(4);
			});
		});

		describe('mixed content operations', () => {
			it('insertText at InlineNode boundary', () => {
				const inline: InlineNode = createInlineNode(imgType);
				const doc = createDocument([
					createBlockNode('paragraph', [createTextNode('ab'), inline, createTextNode('cd')], 'b1'),
				]);
				// Insert text at offset 2 (before inline)
				const step: InsertTextStep = {
					type: 'insertText',
					blockId: 'b1',
					offset: 2,
					text: 'X',
					marks: [],
				};
				const result = applyStep(doc, step);
				const block = result.children[0];
				// "ab" + "X" + inline + "cd" → length 6
				expect(getBlockLength(block)).toBe(6);
				expect(getBlockText(block)).toBe('abXcd');
			});

			it('deleteText range containing InlineNode', () => {
				const inline: InlineNode = createInlineNode(imgType);
				const doc = createDocument([
					createBlockNode('paragraph', [createTextNode('ab'), inline, createTextNode('cd')], 'b1'),
				]);
				// Delete range [1, 4] = 'b' + inline + 'c'
				const step: DeleteTextStep = {
					type: 'deleteText',
					blockId: 'b1',
					from: 1,
					to: 4,
					deletedText: 'bc',
					deletedMarks: [],
					deletedSegments: [{ text: 'bc', marks: [] }],
				};
				const result = applyStep(doc, step);
				const block = result.children[0];
				expect(getBlockText(block)).toBe('ad');
				// InlineNode should be removed
				const inlineChildren = getInlineChildren(block);
				expect(inlineChildren.every((c) => isTextNode(c))).toBe(true);
			});

			it('splitBlock with InlineNode preserves it correctly', () => {
				const inline: InlineNode = createInlineNode(imgType);
				const doc = createDocument([
					createBlockNode('paragraph', [createTextNode('ab'), inline, createTextNode('cd')], 'b1'),
				]);
				// Split at offset 3 (after inline) → first: "ab"+inline, second: "cd"
				const step: SplitBlockStep = {
					type: 'splitBlock',
					blockId: 'b1',
					offset: 3,
					newBlockId: 'b2',
				};
				const result = applyStep(doc, step);
				expect(result.children).toHaveLength(2);
				const first = result.children[0];
				const second = result.children[1];
				expect(getBlockLength(first)).toBe(3);
				expect(getBlockLength(second)).toBe(2);
				expect(getBlockText(second)).toBe('cd');
				// First block should contain the InlineNode
				const firstInline = getInlineChildren(first);
				expect(firstInline.some((c) => isInlineNode(c))).toBe(true);
			});

			it('addMark skips InlineNodes', () => {
				const inline: InlineNode = createInlineNode(imgType);
				const doc = createDocument([
					createBlockNode('paragraph', [createTextNode('ab'), inline, createTextNode('cd')], 'b1'),
				]);
				const step = {
					type: 'addMark' as const,
					blockId: 'b1' as const,
					from: 0,
					to: 5,
					mark: { type: 'bold' as const },
				};
				const result = applyStep(doc, step);
				const block = result.children[0];
				const inlineChildren = getInlineChildren(block);
				// Text nodes should have bold mark
				for (const child of inlineChildren) {
					if (isTextNode(child) && child.text.length > 0) {
						expect(child.marks.some((m) => m.type === 'bold')).toBe(true);
					}
				}
				// InlineNode should be unchanged
				const inlineChild = inlineChildren.find((c) => isInlineNode(c));
				expect(inlineChild).toBeDefined();
			});
		});

		describe('TransactionBuilder InlineNode methods', () => {
			it('insertInlineNode via builder', () => {
				const doc = createDocument([createBlockNode('paragraph', [createTextNode('text')], 'b1')]);
				const state = EditorState.create({
					doc,
					selection: createCollapsedSelection('b1', 2),
				});
				const tr = state
					.transaction('command')
					.insertInlineNode('b1', 2, createInlineNode(imgType))
					.build();
				expect(tr.steps).toHaveLength(1);
				expect(tr.steps[0]?.type).toBe('insertInlineNode');
			});

			it('removeInlineNode via builder auto-derives removedNode', () => {
				const inline: InlineNode = createInlineNode(imgType, { src: 'x.png' });
				const doc = createDocument([
					createBlockNode('paragraph', [createTextNode('ab'), inline, createTextNode('cd')], 'b1'),
				]);
				const state = EditorState.create({
					doc,
					selection: createCollapsedSelection('b1', 2),
				});
				const tr = state.transaction('command').removeInlineNode('b1', 2).build();
				expect(tr.steps).toHaveLength(1);
				const step = tr.steps[0] as RemoveInlineNodeStep;
				expect(step.type).toBe('removeInlineNode');
				expect(step.removedNode.inlineType).toBe('image');
				expect(step.removedNode.attrs).toEqual({ src: 'x.png' });
			});

			it('setInlineNodeAttr via builder', () => {
				const inline: InlineNode = createInlineNode(imgType, { src: 'old.png' });
				const doc = createDocument([
					createBlockNode('paragraph', [createTextNode('ab'), inline, createTextNode('cd')], 'b1'),
				]);
				const state = EditorState.create({
					doc,
					selection: createCollapsedSelection('b1', 2),
				});
				const tr = state
					.transaction('command')
					.setInlineNodeAttr('b1', 2, { src: 'new.png' })
					.build();
				expect(tr.steps).toHaveLength(1);
				const step = tr.steps[0] as SetInlineNodeAttrStep;
				expect(step.attrs).toEqual({ src: 'new.png' });
				expect(step.previousAttrs).toEqual({ src: 'old.png' });
			});
		});
	});
});
