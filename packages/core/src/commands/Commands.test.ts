import { describe, expect, it } from 'vitest';
import {
	createBlockNode,
	createDocument,
	createInlineNode,
	createTextNode,
	getBlockLength,
	getBlockText,
	getInlineChildren,
	getTextChildren,
	isInlineNode,
} from '../model/Document.js';
import { createCollapsedSelection, createSelection } from '../model/Selection.js';
import { inlineType } from '../model/TypeBrands.js';
import { EditorState } from '../state/EditorState.js';
import {
	deleteBackward,
	deleteForward,
	deleteSelectionCommand,
	deleteWordBackward,
	deleteWordForward,
	insertTextCommand,
	isMarkActive,
	mergeBlockBackward,
	selectAll,
	splitBlockCommand,
	toggleBold,
	toggleItalic,
	toggleMark,
	toggleUnderline,
} from './Commands.js';

describe('Commands', () => {
	describe('toggleMark (collapsed)', () => {
		it('toggles stored marks when selection is collapsed', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 3),
			});

			const tr = toggleBold(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			expect(newState.storedMarks).toEqual([{ type: 'bold' }]);
		});

		it('removes stored mark if already active', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello', [{ type: 'bold' }])], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 3),
			});

			const tr = toggleBold(state);
			const newState = state.apply(tr);
			expect(newState.storedMarks).toEqual([]);
		});
	});

	describe('toggleMark (range)', () => {
		it('adds bold to selected range', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
			});

			const tr = toggleBold(state);
			const newState = state.apply(tr);
			const children = getTextChildren(newState.doc.children[0]);
			expect(children[0]?.text).toBe('hello');
			expect(children[0]?.marks).toEqual([{ type: 'bold' }]);
			expect(children[1]?.text).toBe(' world');
			expect(children[1]?.marks).toEqual([]);
		});

		it('removes bold from fully bold range', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello', [{ type: 'bold' }])], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
			});

			const tr = toggleBold(state);
			const newState = state.apply(tr);
			expect(getTextChildren(newState.doc.children[0])[0]?.marks).toEqual([]);
		});
	});

	describe('toggleMark respects features', () => {
		it('returns null when feature is disabled', () => {
			const state = EditorState.create();
			const tr = toggleBold(state, { bold: false, italic: true, underline: true });
			expect(tr).toBeNull();
		});
	});

	describe('insertTextCommand', () => {
		it('inserts text at cursor', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = insertTextCommand(state, 'hello');
			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('hello');
			expect(newState.selection.anchor.offset).toBe(5);
		});

		it('replaces selected text', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
			});

			const tr = insertTextCommand(state, 'hi');
			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('hi world');
		});
	});

	describe('deleteBackward', () => {
		it('deletes one character backward', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});

			const tr = deleteBackward(state);
			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('hell');
		});

		it('merges with previous block at offset 0', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				createBlockNode('paragraph', [createTextNode('world')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b2', 0),
			});

			const tr = deleteBackward(state);
			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(1);
			expect(getBlockText(newState.doc.children[0])).toBe('helloworld');
		});

		it('returns null at start of first block', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			expect(deleteBackward(state)).toBeNull();
		});
	});

	describe('deleteForward', () => {
		it('deletes one character forward', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = deleteForward(state);
			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('ello');
		});
	});

	describe('deleteWordBackward', () => {
		it('deletes entire word backward', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 11),
			});

			const tr = deleteWordBackward(state);
			const newState = state.apply(tr);
			expect(getBlockText(newState.doc.children[0])).toBe('hello ');
		});
	});

	describe('splitBlockCommand', () => {
		it('splits block at cursor', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello world')], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 5),
			});

			const tr = splitBlockCommand(state);
			const newState = state.apply(tr);
			expect(newState.doc.children).toHaveLength(2);
			expect(getBlockText(newState.doc.children[0])).toBe('hello');
		});
	});

	describe('selectAll', () => {
		it('selects from start of first block to end of last block', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('hello')], 'b1'),
				createBlockNode('paragraph', [createTextNode('world')], 'b2'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = selectAll(state);
			const newState = state.apply(tr);
			expect(newState.selection.anchor.blockId).toBe('b1');
			expect(newState.selection.anchor.offset).toBe(0);
			expect(newState.selection.head.blockId).toBe('b2');
			expect(newState.selection.head.offset).toBe(5);
		});
	});

	describe('isMarkActive', () => {
		it('returns true when cursor is inside bold text', () => {
			const doc = createDocument([
				createBlockNode('paragraph', [createTextNode('bold', [{ type: 'bold' }])], 'b1'),
			]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
			});

			expect(isMarkActive(state, 'bold')).toBe(true);
			expect(isMarkActive(state, 'italic')).toBe(false);
		});

		it('uses stored marks when available', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 3),
			});

			// Toggle bold to set stored marks
			const tr = toggleBold(state);
			const newState = state.apply(tr);

			expect(isMarkActive(newState, 'bold')).toBe(true);
		});
	});

	describe('deleteSelectionCommand', () => {
		it('returns null for collapsed selection', () => {
			const state = EditorState.create();
			expect(deleteSelectionCommand(state)).toBeNull();
		});
	});

	describe('combined marks', () => {
		it('applies bold and italic independently', () => {
			const doc = createDocument([createBlockNode('paragraph', [createTextNode('hello')], 'b1')]);
			let state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 5 }),
			});

			state = state.apply(toggleBold(state));
			state = state.apply(toggleItalic(state));

			const marks = getTextChildren(state.doc.children[0])[0]?.marks;
			expect(marks).toHaveLength(2);
			expect(marks?.some((m: { type: string }) => m.type === 'bold')).toBe(true);
			expect(marks?.some((m: { type: string }) => m.type === 'italic')).toBe(true);
		});
	});

	describe('InlineNode commands', () => {
		it('deleteBackward removes InlineNode at cursor', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('ab'), createInlineNode(inlineType('img')), createTextNode('cd')],
					'b1',
				),
			]);
			// Cursor right after inline (offset 3)
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 3),
			});

			const tr = deleteBackward(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const block = newState.doc.children[0];
			expect(block).toBeDefined();
			if (!block) return;
			// InlineNode removed: "ab" + "cd" merged
			expect(getBlockLength(block)).toBe(4);
			expect(getBlockText(block)).toBe('abcd');
		});

		it('deleteForward removes InlineNode at cursor', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('ab'), createInlineNode(inlineType('img')), createTextNode('cd')],
					'b1',
				),
			]);
			// Cursor right before inline (offset 2)
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 2),
			});

			const tr = deleteForward(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const block = newState.doc.children[0];
			expect(block).toBeDefined();
			if (!block) return;
			expect(getBlockLength(block)).toBe(4);
			expect(getBlockText(block)).toBe('abcd');
		});

		it('deleteWordBackward stops at InlineNode boundary', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello'), createInlineNode(inlineType('img')), createTextNode('world')],
					'b1',
				),
			]);
			// Cursor at end of "world" (offset 11)
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 11),
			});

			const tr = deleteWordBackward(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const block = newState.doc.children[0];
			expect(block).toBeDefined();
			if (!block) return;
			// "world" deleted, InlineNode preserved
			const children = getInlineChildren(block);
			expect(children.some((c) => isInlineNode(c))).toBe(true);
			expect(getBlockText(block)).toBe('hello');
		});

		it('deleteWordForward stops at InlineNode boundary', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello'), createInlineNode(inlineType('img')), createTextNode('world')],
					'b1',
				),
			]);
			// Cursor at start (offset 0)
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 0),
			});

			const tr = deleteWordForward(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const block = newState.doc.children[0];
			expect(block).toBeDefined();
			if (!block) return;
			// "hello" deleted, InlineNode preserved
			const children = getInlineChildren(block);
			expect(children.some((c) => isInlineNode(c))).toBe(true);
		});

		it('deleteWordBackward deletes InlineNode when cursor is right after it', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('hello'), createInlineNode(inlineType('img')), createTextNode('world')],
					'b1',
				),
			]);
			// Cursor right after inline (offset 6)
			const state = EditorState.create({
				doc,
				selection: createCollapsedSelection('b1', 6),
			});

			const tr = deleteWordBackward(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const block = newState.doc.children[0];
			expect(block).toBeDefined();
			if (!block) return;
			// InlineNode should be deleted
			const children = getInlineChildren(block);
			expect(children.every((c) => !isInlineNode(c))).toBe(true);
		});

		it('selection deletion spanning InlineNode removes it', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[createTextNode('ab'), createInlineNode(inlineType('img')), createTextNode('cd')],
					'b1',
				),
			]);
			// Selection from offset 1 to offset 4: "b" + inline + "c"
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 1 }, { blockId: 'b1', offset: 4 }),
			});

			const tr = deleteSelectionCommand(state);
			expect(tr).not.toBeNull();

			const newState = state.apply(tr);
			const block = newState.doc.children[0];
			expect(block).toBeDefined();
			if (!block) return;
			expect(getBlockText(block)).toBe('ad');
			expect(getBlockLength(block)).toBe(2);
		});

		it('isMarkActive skips InlineNodes in range check', () => {
			const doc = createDocument([
				createBlockNode(
					'paragraph',
					[
						createTextNode('bold', [{ type: 'bold' }]),
						createInlineNode(inlineType('img')),
						createTextNode('bold', [{ type: 'bold' }]),
					],
					'b1',
				),
			]);
			// Selection spanning all content including inline
			const state = EditorState.create({
				doc,
				selection: createSelection({ blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 9 }),
			});

			// Bold should be active (all text is bold, InlineNode skipped)
			expect(isMarkActive(state, 'bold')).toBe(true);
		});
	});
});
